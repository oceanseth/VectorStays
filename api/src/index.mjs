/**
 * BnBMesh serverless API — Lambda handler behind a Function URL, fronted by
 * CloudFront at https://bnbmesh.ai/api/*.
 *
 * Routes:
 *   GET  /api/search?q=...    → meta-search (TinyFish live, or deterministic mock)
 *   POST /api/mcp             → Streamable-HTTP MCP server (JSON-RPC 2.0)
 *   GET  /api/health          → sanity probe
 *
 * Sponsor integrations live under /api/{reddit,tinyfish,mcp} and degrade
 * gracefully to mock data when env vars are unset.
 */

import { createClient } from 'redis'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const TINYFISH_API_KEY      = process.env.TINYFISH_API_KEY || ''
const TINYFISH_API_BASE     = process.env.TINYFISH_API_BASE || 'https://agent.tinyfish.ai/v1'
const REDIS_URL             = process.env.REDIS_URL || ''
const VAPI_PRIVATE_KEY      = process.env.VAPI_PRIVATE_KEY || ''
const VAPI_API_BASE         = 'https://api.vapi.ai'
const X402_PAYMENT_ADDRESS  = process.env.X402_PAYMENT_ADDRESS || '0x0000000000000000000000000000000000000000'
const X402_PRICE_USD        = process.env.X402_PRICE_USD || '0.05'
const FIREBASE_PROJECT_ID   = process.env.FIREBASE_PROJECT_ID || 'vectorsupportagent'
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'seth@voicecert.com,seth@snapchallenge.com,seth@snapchallenge.net')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const SSM_BASE = process.env.SSM_BASE || '/bnbmesh/production'

// Call IDs are 32-char hex (128 bits). Reject anything else immediately.
const CALL_ID_RE = /^[a-f0-9]{32}$/

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Knowledge base (3-category FAQ used by the voice agent and the admin UI)
// ---------------------------------------------------------------------------

const KB_CATEGORIES = ['hosts', 'guests', 'faq']

function defaultKb() {
  return {
    hosts: 'BnBMesh helps existing short-term-rental hosts in three ways: ' +
      '(1) customer-support voice agents that take guest calls 24/7 on a shared BnBMesh number, ' +
      'identify the caller against the host’s reservations, and SMS the host only when a human is needed. ' +
      '(2) Direct listings — hosts can publish their property to BnBMesh’s search and bypass platform commissions on direct bookings. ' +
      '(3) Operations agents (coming soon) that monitor cleanings, pricing, and reservation issues across Guesty/Hospitable/etc.',
    guests: 'BnBMesh searches Airbnb, VRBO, HomeAway, and direct-host listings in one place. ' +
      'Guests can find the cheapest option per night and book directly with hosts when available, skipping platform fees. ' +
      'During a stay, the BnBMesh AI support number can answer questions about wifi, check-in, parking, etc., and bring the host into the call when needed.',
    faq: 'Pricing: free for guests, free for hosts to list. AI customer support is $20 / month / listing. ' +
      'For cities and governments: BnBMesh exposes compliance + tax automation features that route directly to local agencies, with no corporate skim. ' +
      'For partners (PMS providers, payment rails, telephony): integration is via OAuth or API key. Reach out via the Become-a-Partner flow on the homepage.',
    updated_at: null,
    updated_by: null,
  }
}

function sanitizeKb(input) {
  const src = (input && typeof input === 'object') ? input : {}
  const out = {}
  for (const k of KB_CATEGORIES) {
    out[k] = typeof src[k] === 'string' ? src[k].slice(0, 8000) : ''
  }
  return out
}

async function readKb() {
  const c = await redis()
  if (!c) return defaultKb()
  try {
    const v = await c.get('bnbmesh:kb')
    if (!v) return defaultKb()
    const parsed = JSON.parse(v)
    return { ...defaultKb(), ...parsed }
  } catch (e) {
    console.warn('readKb', e.message)
    return defaultKb()
  }
}

// ---------------------------------------------------------------------------
// Firebase ID token verification (modular, no firebase-admin SDK).
// Verifies signature against Google's public certs, audience = projectId.
// ---------------------------------------------------------------------------

const FIREBASE_JWKS = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
))

async function verifyFirebaseIdToken(authHeader) {
  if (!authHeader) return null
  const m = String(authHeader).match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  try {
    const { payload } = await jwtVerify(m[1], FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    })
    return payload  // includes uid (sub), email, email_verified, phone_number, etc.
  } catch (e) {
    console.warn('id token verify failed:', e.code || e.message)
    return null
  }
}

function isAdminClaims(claims) {
  if (!claims?.email) return false
  return ADMIN_EMAILS.includes(String(claims.email).toLowerCase())
}

// ---------------------------------------------------------------------------
// Secret loader. Source of truth lives in SSM Parameter Store at
// /bnbmesh/production/* but we hydrate from Lambda env vars to dodge the
// @aws-sdk/client-ssm ESM/CJS pain on Node 22. terraform/load-ssm.sh fetches
// the values into TF_VAR_* before apply, so rotation is still one place.
// ---------------------------------------------------------------------------

// Verify a Stripe webhook signature header against `whsec_...` secret.
// Header shape: `t=<unix>,v1=<hex>` (and optional v0). Only checks v1.
async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false
  const parts = Object.fromEntries(
    String(sigHeader).split(',').map((p) => p.split('=')).filter((kv) => kv.length === 2),
  )
  const t = parts.t
  const v1 = parts.v1
  if (!t || !v1) return false
  const { createHmac, timingSafeEqual } = await import('node:crypto')
  const mac = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(v1, 'hex'))
  } catch { return false }
}

async function ssmGet(name) {
  if (name.endsWith('/stripe_secret_key'))     return process.env.STRIPE_SECRET_KEY     || ''
  if (name.endsWith('/stripe_price_id'))       return process.env.STRIPE_PRICE_ID       || ''
  if (name.endsWith('/stripe_webhook_secret')) return process.env.STRIPE_WEBHOOK_SECRET || ''
  return ''
}

const PLATFORMS = ['airbnb', 'vrbo', 'homeaway', 'direct']

// ---------------------------------------------------------------------------
// Mock search — deterministic fallback so demos look consistent.
// ---------------------------------------------------------------------------

// "demo" placeholders — used ONLY when TinyFish times out so the UI has
// something to render. Never includes "direct" pricing because we don't make
// up direct listings. The frontend should label these as demo, not real.
function mockSearchResults(q) {
  const seed = hashString(q || 'default')
  const city = extractCity(q) || 'Santa Barbara'
  const beds = extractBedrooms(q) || 3
  const samples = [
    ['Oceanview Retreat', 'Santa Barbara, CA'],
    ['Downtown Casita', 'Austin, TX'],
    ['Mountainside Cabin', 'Big Bear, CA'],
    ['Historic Craftsman', 'Pasadena, CA'],
  ]
  // Only platforms we'd legitimately scrape from. "direct" is intentionally
  // absent — real direct listings come from Redis only.
  const SCRAPE_PLATFORMS = ['airbnb', 'vrbo', 'homeaway']
  return samples.map((s, i) => {
    const base = 120 + ((seed + i * 37) % 280)
    const platforms = Object.fromEntries(
      SCRAPE_PLATFORMS.map((p, j) => [p, Math.round(base * (1 + ((seed >> (j + 1)) & 0x1f) / 100))])
    )
    const cheapestPlatform = Object.entries(platforms).sort((a, b) => a[1] - b[1])[0][0]
    return {
      id: `mesh_${i}`,
      title: s[0],
      location: i === 0 ? city : s[1],
      nightlyPrice: platforms[cheapestPlatform],
      cheapestPlatform,
      platforms,
      beds: i === 0 ? beds : 2 + (i % 3),
      isDemo: true,
    }
  })
}

function hashString(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function extractCity(q) {
  const m = (q || '').match(/\b(santa barbara|austin|big bear|pasadena|palm springs|los angeles|san francisco|new york|miami)\b/i)
  return m ? m[0].replace(/\b\w/g, (c) => c.toUpperCase()) : null
}
function extractBedrooms(q) {
  const m = (q || '').match(/(\d+)\s*(?:br|bed|bedroom)/i)
  return m ? parseInt(m[1], 10) : null
}

// ---------------------------------------------------------------------------
// TinyFish live search — uses their Agent API to scrape listing platforms.
// Falls back to mock on error or when API key isn't set.
// ---------------------------------------------------------------------------

/**
 * Run one TinyFish scrape on a specific URL with a goal prompt.
 * TinyFish returns a Server-Sent Events stream; the final event with
 * type === "COMPLETE" and status === "COMPLETED" carries `resultJson`.
 */
async function tinyfishRun(url, goal, { stealth = true, timeoutMs = 22000 } = {}) {
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctrl.abort() }, timeoutMs)
  try {
    return await _tinyfishRunInner(url, goal, { stealth, signal: ctrl.signal })
  } catch (e) {
    if (timedOut) throw new Error(`tinyfish timeout after ${timeoutMs}ms`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function _tinyfishRunInner(url, goal, { stealth, signal }) {
  const resp = await fetch(`${TINYFISH_API_BASE}/automation/run-sse`, {
    method: 'POST',
    headers: {
      'X-API-Key': TINYFISH_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      goal,
      browser_profile: stealth ? 'stealth' : 'default',
    }),
    signal,
  })
  if (!resp.ok) {
    throw new Error(`tinyfish ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  }
  // Stream-parse SSE so we can bail the moment we see the COMPLETE event
  // instead of waiting for the server to close the connection.
  const reader = resp.body.getReader()
  const dec = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += dec.decode(value, { stream: true })
      const chunks = buffer.split(/\r?\n\r?\n/)
      buffer = chunks.pop() // keep the trailing partial
      for (const chunk of chunks) {
        for (const line of chunk.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            const ev = JSON.parse(payload)
            if (ev.type === 'COMPLETE' && ev.status === 'COMPLETED') {
              let parsed = ev.resultJson
              if (typeof parsed === 'string') parsed = JSON.parse(parsed)
              try { await reader.cancel() } catch {}
              return parsed
            }
          } catch { /* skip non-JSON */ }
        }
      }
    }
  } finally {
    try { await reader.cancel() } catch {}
  }
  throw new Error('tinyfish: no COMPLETE event in stream')
}

// Read direct listings from Redis (host-onboarded inventory). These are
// added to the index whenever a host call ends with structured listing
// data captured by the Vapi `update_listing` tool. We never invent direct
// listings — if no host has onboarded one, none show.
async function fetchDirectListings(query) {
  const c = await redis()
  if (!c) return []
  let ids = []
  try {
    ids = await c.sMembers('bnbmesh:listings:index')
  } catch { return [] }
  if (!ids?.length) return []

  const filters = parseSearchQuery(query)
  const items = []
  for (const id of ids) {
    try {
      const raw = await c.get(`bnbmesh:listing:${id}`)
      if (!raw) continue
      const l = JSON.parse(raw)
      // Only ACTIVE listings appear in public search results.
      if (l.status !== 'active') continue
      if (matchesFilters(l, filters)) items.push(toDirectResult(l))
    } catch {}
  }
  return items
}

// Parse a free-text query into structured filters: city, state, zip, beds.
function parseSearchQuery(query) {
  const q = (query || '').toLowerCase()
  const f = { raw: q, tokens: [], city: null, state: null, zip: null, beds: null }

  // 5-digit US zip
  const zipMatch = q.match(/\b(\d{5})\b/)
  if (zipMatch) f.zip = zipMatch[1]

  // bedrooms — "3 bedroom", "3br", "3-bedroom", "3 bed"
  const bedMatch = q.match(/\b(\d+)\s*(?:br|bd|bed|bedrooms?)\b/i)
  if (bedMatch) f.beds = parseInt(bedMatch[1], 10)

  // city — known cities (extend as inventory grows)
  const cityMatch = q.match(/\b(santa barbara|austin|big bear|pasadena|palm springs|los angeles|san francisco|new york|miami|denver|nashville)\b/)
  if (cityMatch) f.city = cityMatch[1]

  // 2-letter state abbrev with comma context
  const stateMatch = q.match(/\b([a-z]{2})\b(?:\s|$)/)
  if (stateMatch && /^(?:al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)$/.test(stateMatch[1])) {
    f.state = stateMatch[1]
  }

  // Fallback tokens that didn't get parsed into a structured filter
  f.tokens = q.split(/\s+/).filter((t) => t.length > 2 && !['for','the','and','with','near','any'].includes(t))

  return f
}

function matchesFilters(listing, f) {
  const addr = (listing.address || '').toLowerCase()
  const hay = `${addr} ${(listing.title || '').toLowerCase()} ${(listing.description || '').toLowerCase()} ${(listing.amenities || []).join(' ').toLowerCase()}`

  // Hard filters — if specified, must match.
  if (f.zip && !addr.includes(f.zip)) return false
  if (f.city && !addr.includes(f.city)) return false
  if (f.state) {
    // Match `, ca` (with the comma) to avoid coincidental two-letter matches.
    const re = new RegExp(`,\\s*${f.state}\\b`)
    if (!re.test(addr)) return false
  }
  if (f.beds != null && (listing.bedrooms == null || Number(listing.bedrooms) < f.beds)) return false

  // If we already matched any structured filter, accept.
  if (f.zip || f.city || f.state || f.beds != null) return true

  // No structured filter — fall back to token overlap.
  if (!f.tokens.length) return true
  return f.tokens.some((t) => hay.includes(t))
}

function toDirectResult(l) {
  const price = l.nightlyPrice ? Math.round(Number(l.nightlyPrice)) : null
  return {
    id: `direct_${l.id || (l.address || Math.random().toString(36).slice(2)).replace(/\W+/g, '_')}`,
    title: l.title || 'BnBMesh Direct Listing',
    location: l.address || '',
    beds: l.bedrooms ?? null,
    platforms: price ? { direct: price } : {},
    cheapestPlatform: price ? 'direct' : null,
    nightlyPrice: price,
    isDirect: true,
  }
}

// Upstash Redis is the cache of record. In-memory Map is a per-Lambda-container
// L1 on top so the same warm container doesn't pay a Redis round-trip twice.
const L1_CACHE = new Map()
const SEARCH_TTL_SECONDS = 10 * 60

async function searchListings(query, { timeoutMs = 22000 } = {}) {
  // Always try to surface real direct listings — independent of TinyFish.
  const direct = await fetchDirectListings(query)

  if (!TINYFISH_API_KEY) {
    return {
      source: direct.length ? 'demo+direct' : 'demo',
      results: [...direct, ...mockSearchResults(query)],
      direct_count: direct.length,
    }
  }
  const cacheKey = `bnbmesh:search:${query.trim().toLowerCase()}`
  // L1 (in-memory)
  const l1 = L1_CACHE.get(cacheKey)
  if (l1 && l1.expires > Date.now()) {
    return {
      source: direct.length ? 'live-cached+direct' : 'live-cached',
      results: [...direct, ...l1.results],
      direct_count: direct.length,
    }
  }
  // L2 (Upstash Redis)
  if (redisConfigured()) {
    const cached = await redisGet(cacheKey)
    if (cached && Array.isArray(cached)) {
      L1_CACHE.set(cacheKey, { results: cached, expires: Date.now() + 60_000 })
      return {
        source: direct.length ? 'live-cached+direct' : 'live-cached',
        results: [...direct, ...cached],
        direct_count: direct.length,
      }
    }
  }
  try {
    // For MVP: scrape Airbnb only (fastest, single-site call). VRBO/HomeAway
    // can be added in parallel once we've proven the pipeline.
    const listings = await tinyfishRun(
      'https://www.airbnb.com/',
      `Search for "${query}". Wait for results to load. Extract the first 6 visible listings as JSON array with keys: title (string), location (string), price_per_night_usd (number), bedrooms (number), url (string). Return ONLY the JSON array.`,
      { timeoutMs },
    )
    const arr = Array.isArray(listings) ? listings : (listings?.results || [])
    const results = arr.slice(0, 6).map((r, i) => {
      const price = Math.round(Number(r.price_per_night_usd ?? r.price ?? 0)) || null
      const platforms = price ? { airbnb: price } : {}
      return {
        id: `mesh_${i}`,
        title: r.title || r.name || `Listing ${i + 1}`,
        location: r.location || r.city || '',
        beds: r.bedrooms ?? r.beds ?? null,
        platforms,
        urls: r.url ? { airbnb: r.url } : {},
        cheapestPlatform: price ? 'airbnb' : null,
        nightlyPrice: price,
      }
    })
    L1_CACHE.set(cacheKey, { results, expires: Date.now() + 60_000 })
    if (redisConfigured()) {
      // Fire-and-forget so we don't block the response on the write.
      redisSetEx(cacheKey, SEARCH_TTL_SECONDS, results).catch(() => {})
    }
    return {
      source: direct.length ? 'live+direct' : 'live',
      results: [...direct, ...results],
      direct_count: direct.length,
    }
  } catch (e) {
    console.warn('tinyfish threw:', e.message)
    return {
      source: direct.length ? 'demo+direct' : 'demo',
      results: [...direct, ...mockSearchResults(query)],
      fallback_reason: e.message,
      direct_count: direct.length,
    }
  }
}

// ---------------------------------------------------------------------------
// Redis (Redis Cloud, TCP) — listing cache + agent memory layer.
// One client is reused across warm Lambda invocations.
// ---------------------------------------------------------------------------

function redisConfigured() { return !!REDIS_URL }

let _redisClient = null
let _redisConnecting = null

async function redis() {
  if (!REDIS_URL) return null
  if (_redisClient && _redisClient.isOpen) return _redisClient
  if (_redisConnecting) return _redisConnecting
  _redisConnecting = (async () => {
    const client = createClient({
      url: REDIS_URL,
      socket: { connectTimeout: 5000, reconnectStrategy: (retries) => Math.min(retries * 100, 1000) },
    })
    client.on('error', (e) => console.warn('redis client error:', e.message))
    await client.connect()
    _redisClient = client
    return client
  })()
  try { return await _redisConnecting } finally { _redisConnecting = null }
}

async function redisGet(key) {
  try {
    const c = await redis()
    if (!c) return null
    const v = await c.get(key)
    if (v == null) return null
    try { return JSON.parse(v) } catch { return v }
  } catch (e) { console.warn('redis get', e.message); return null }
}

async function redisSetEx(key, ttlSeconds, value) {
  try {
    const c = await redis()
    if (!c) return null
    const payload = typeof value === 'string' ? value : JSON.stringify(value)
    return await c.set(key, payload, { EX: ttlSeconds })
  } catch (e) { console.warn('redis set', e.message); return null }
}

async function memRemember(agentId, key, value) {
  try {
    const c = await redis()
    if (!c) return null
    return await c.hSet(`bnbmesh:mem:${agentId}`, key,
      typeof value === 'string' ? value : JSON.stringify(value))
  } catch (e) { console.warn('redis hset', e.message); return null }
}

async function memRecall(agentId) {
  try {
    const c = await redis()
    if (!c) return {}
    const obj = await c.hGetAll(`bnbmesh:mem:${agentId}`)
    const out = {}
    for (const [k, v] of Object.entries(obj || {})) {
      try { out[k] = JSON.parse(v) } catch { out[k] = v }
    }
    return out
  } catch (e) { console.warn('redis hgetall', e.message); return {} }
}

// ---------------------------------------------------------------------------
// x402 payment wall (HTTP 402 + x-payment descriptor).
// Gate "plan_split_stay" behind it. Clients that send a valid x-payment
// header (any non-empty value in the MVP) pass through.
// ---------------------------------------------------------------------------

function x402Response(resource, description) {
  const body = {
    error: 'payment_required',
    x402_version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: 'base-sepolia',
        maxAmountRequired: X402_PRICE_USD,
        asset: 'USDC',
        resource,
        description,
        payTo: X402_PAYMENT_ADDRESS,
      },
    ],
  }
  return {
    statusCode: 402,
    headers: {
      'content-type': 'application/json',
      'x-402-version': '1',
      'access-control-allow-origin': '*',
    },
    body: JSON.stringify(body),
  }
}

function hasPayment(event) {
  const h = event.headers || {}
  return !!(h['x-payment'] || h['X-Payment'] || h['x-402-payment'])
}

// ---------------------------------------------------------------------------
// MCP server — streamable HTTP transport, minimal JSON-RPC 2.0.
// ---------------------------------------------------------------------------

const MCP_TOOLS = [
  {
    name: 'search_listings',
    description:
      'Search short-term rental listings across Airbnb, VRBO, HomeAway, and direct sites. Returns a ranked list with per-platform pricing. Powered by TinyFish live web agents.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Natural-language search' } },
      required: ['query'],
    },
  },
  {
    name: 'compare_platforms',
    description:
      'Given a listing_id returned by search_listings, show detailed price comparison across every platform for the date range.',
    inputSchema: {
      type: 'object',
      properties: { listing_id: { type: 'string' } },
      required: ['listing_id'],
    },
  },
  {
    name: 'plan_split_stay',
    description:
      'Plan a multi-stay itinerary when no single listing covers the entire date range. Returns 2–3 compatible stays in the same neighborhood. Premium tool — gated behind x402 payment.',
    inputSchema: {
      type: 'object',
      properties: {
        query:     { type: 'string' },
        check_in:  { type: 'string', format: 'date' },
        check_out: { type: 'string', format: 'date' },
      },
      required: ['query', 'check_in', 'check_out'],
    },
  },
  {
    name: 'remember_preference',
    description:
      'Store a preference or fact about the user (e.g. "no cats", "prefers downtown") in the agent memory layer. Persisted in Redis and available to future tool calls for this agent_id.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Stable identifier for this user/agent' },
        key:      { type: 'string' },
        value:    { type: 'string' },
      },
      required: ['agent_id', 'key', 'value'],
    },
  },
  {
    name: 'recall_preferences',
    description:
      'Retrieve all stored preferences for a given agent_id. Use this before search_listings so the agent can personalize results.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
      },
      required: ['agent_id'],
    },
  },
]

function mcpError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}
function mcpResult(id, result) {
  return { jsonrpc: '2.0', id, result }
}

async function handleMcp(rpc, event) {
  const { id, method, params } = rpc

  if (method === 'initialize') {
    return mcpResult(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'bnbmesh', version: '0.1.0' },
    })
  }

  if (method === 'tools/list') {
    return mcpResult(id, { tools: MCP_TOOLS })
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {}

    if (name === 'search_listings') {
      const out = await searchListings(args?.query || '')
      return mcpResult(id, {
        content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
      })
    }

    if (name === 'compare_platforms') {
      return mcpResult(id, {
        content: [{
          type: 'text',
          text: JSON.stringify(
            { listing_id: args?.listing_id, platforms: { airbnb: 210, vrbo: 198, homeaway: 222, direct: 185 } },
            null, 2
          ),
        }],
      })
    }

    if (name === 'plan_split_stay') {
      if (!hasPayment(event)) {
        return mcpResult(id, {
          isError: true,
          content: [{
            type: 'text',
            text: 'Premium tool — requires x402 payment. Re-call with an x-payment header, or pay via an x402-aware client.',
          }],
        })
      }
      const out = await searchListings(args?.query || '')
      const stays = (out.results || []).slice(0, 2)
      return mcpResult(id, {
        content: [{
          type: 'text',
          text: JSON.stringify(
            { query: args?.query, check_in: args?.check_in, check_out: args?.check_out, stays },
            null, 2
          ),
        }],
      })
    }

    if (name === 'remember_preference') {
      if (!redisConfigured()) {
        return mcpResult(id, {
          isError: true,
          content: [{ type: 'text', text: 'Redis not configured — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.' }],
        })
      }
      await memRemember(args?.agent_id, args?.key, args?.value)
      return mcpResult(id, { content: [{ type: 'text', text: `remembered ${args?.key} for ${args?.agent_id}` }] })
    }

    if (name === 'recall_preferences') {
      const prefs = await memRecall(args?.agent_id)
      return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(prefs, null, 2) }] })
    }

    return mcpError(id, -32601, `Unknown tool: ${name}`)
  }

  if (id === undefined) return null // notification
  return mcpError(id, -32601, `Unknown method: ${method}`)
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization, x-payment',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      ...extraHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}

function trimPath(p) { return (p || '/').replace(/\/+$/, '') || '/' }

export const handler = async (event) => {
  const method = (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase()
  const path = trimPath(event.rawPath || event.path || '/')

  if (method === 'OPTIONS') return json(204, '')

  if (path === '/api/health' || path === '/health') {
    return json(200, {
      ok: true,
      service: 'bnbmesh-api',
      ts: new Date().toISOString(),
      integrations: {
        tinyfish: !!TINYFISH_API_KEY,
        redis:    redisConfigured(),
        x402:     true,
      },
    })
  }

  if (path === '/api/search' || path === '/search') {
    const q = event.queryStringParameters?.q || ''
    // ?fast=1 — voice-context: bail fast (2.5s), prefer cache + mock so the
    //          Vapi tool call returns under 3s and the call doesn't stall.
    // ?live=1 — direct invoke (no API GW cap): wait up to 55s for TinyFish.
    // default — UI search: 22s.
    const live = event.queryStringParameters?.live === '1'
    const fast = event.queryStringParameters?.fast === '1'
    const timeoutMs = live ? 55000 : fast ? 2500 : 22000
    const out = await searchListings(q, { timeoutMs })
    return json(200, { query: q, ...out })
  }

  if (path === '/api/split-stay' || path === '/split-stay') {
    if (!hasPayment(event)) {
      return x402Response('/api/split-stay', 'Plan a multi-stay itinerary')
    }
    const q = event.queryStringParameters?.q || ''
    const out = await searchListings(q)
    return json(200, { query: q, stays: (out.results || []).slice(0, 2) })
  }

  // ---- Knowledge base (FAQ for the voice agent + admin editor) ----------
  // Single Redis blob bnbmesh:kb. Read publicly so the support modal can
  // surface category bullets; only admins can write.
  if (path === '/api/kb' || path === '/kb') {
    if (method !== 'GET') return json(405, { error: 'method not allowed' })
    return json(200, { kb: await readKb() })
  }

  if (path === '/api/admin/kb' || path === '/admin/kb') {
    if (method === 'GET') {
      const claims = await verifyFirebaseIdToken(event.headers?.authorization || event.headers?.Authorization)
      if (!isAdminClaims(claims)) return json(403, { error: 'admin only' })
      return json(200, { kb: await readKb() })
    }
    if (method === 'POST') {
      const claims = await verifyFirebaseIdToken(event.headers?.authorization || event.headers?.Authorization)
      if (!isAdminClaims(claims)) return json(403, { error: 'admin only' })
      let body = {}
      try {
        body = event.body
          ? (event.isBase64Encoded ? JSON.parse(Buffer.from(event.body, 'base64').toString()) : JSON.parse(event.body))
          : {}
      } catch { return json(400, { error: 'bad json' }) }
      const next = sanitizeKb(body.kb || body)
      next.updated_at = new Date().toISOString()
      next.updated_by = claims.email || claims.sub
      const c = await redis()
      if (!c) return json(503, { error: 'redis not configured' })
      await c.set('bnbmesh:kb', JSON.stringify(next))
      return json(200, { kb: next })
    }
    return json(405, { error: 'method not allowed' })
  }

  // ---- Vapi server-side tools -------------------------------------------
  // POST /api/vapi/tool — Vapi calls this directly when the assistant
  // invokes a tool that has a server.url configured. Request body:
  //   { message: { type: "tool-calls", toolCallList: [{ id, function: { name, arguments } }] } }
  // Response (Vapi expects):
  //   { results: [{ toolCallId, result }] }
  if (path === '/api/vapi/tool' || path === '/vapi/tool') {
    if (method !== 'POST') return json(405, { error: 'method not allowed' })
    let body = {}
    try {
      body = event.body
        ? (event.isBase64Encoded ? JSON.parse(Buffer.from(event.body, 'base64').toString()) : JSON.parse(event.body))
        : {}
    } catch { return json(400, { error: 'bad json' }) }

    const calls = body?.message?.toolCallList || body?.toolCallList || []
    // Vapi forwards the metadata we set in vapi.start({ metadata: ... })
    // on each tool-call payload. Use it to identify the signed-in user
    // for tools that require ownership (list_my_listings, edit_listing).
    const metadata = body?.message?.call?.assistantOverrides?.metadata
                  || body?.message?.call?.metadata
                  || body?.call?.metadata
                  || {}
    const callerUid = metadata?.firebase_uid || null
    const results = []
    for (const tc of calls) {
      const name = tc?.function?.name || tc?.name
      let args = tc?.function?.arguments ?? tc?.arguments ?? {}
      if (typeof args === 'string') {
        try { args = JSON.parse(args) } catch { args = {} }
      }
      const tcId = tc?.id || tc?.toolCallId
      try {
        if (name === 'get_kb') {
          const kb = await readKb()
          const cat = String(args?.category || '').toLowerCase()
          const content = KB_CATEGORIES.includes(cat) ? kb[cat] : null
          results.push({
            toolCallId: tcId,
            result: JSON.stringify(content
              ? { category: cat, content }
              : { error: `unknown category: ${args?.category}`, allowed: KB_CATEGORIES }),
          })
          continue
        }
        if (name === 'list_my_listings') {
          if (!callerUid) {
            results.push({ toolCallId: tcId, result: JSON.stringify({ error: 'caller is not signed in. Tell the user to sign in first.' }) })
            continue
          }
          const c = await redis()
          if (!c) { results.push({ toolCallId: tcId, result: JSON.stringify({ error: 'storage offline' }) }); continue }
          const ids = await c.sMembers(`bnbmesh:host:${callerUid}:listings`).catch(() => [])
          const items = []
          for (const id of ids) {
            try {
              const v = await c.get(`bnbmesh:listing:${id}`)
              if (v) {
                const l = JSON.parse(v)
                items.push({
                  id: l.id, title: l.title, address: l.address,
                  status: l.status, bedrooms: l.bedrooms, nightlyPrice: l.nightlyPrice,
                  customer_support_enabled: !!l.customer_support_enabled,
                })
              }
            } catch {}
          }
          results.push({ toolCallId: tcId, result: JSON.stringify({ listings: items }) })
          continue
        }

        if (name === 'edit_listing') {
          if (!callerUid) {
            results.push({ toolCallId: tcId, result: JSON.stringify({ error: 'caller is not signed in' }) })
            continue
          }
          const listingId = String(args?.listing_id || '')
          const field = String(args?.field || '')
          const value = args?.value
          const allowed = new Set([
            'address','title','description','propertyType','bedrooms','bathrooms','maxGuests',
            'amenities','nightlyPrice','cleaningFee','minNights','checkIn','checkOut','houseRules',
          ])
          if (!listingId || !field || !allowed.has(field)) {
            results.push({ toolCallId: tcId, result: JSON.stringify({ error: `invalid input — field must be one of: ${[...allowed].join(', ')}` }) })
            continue
          }
          const c = await redis()
          if (!c) { results.push({ toolCallId: tcId, result: JSON.stringify({ error: 'storage offline' }) }); continue }
          const raw = await c.get(`bnbmesh:listing:${listingId}`)
          if (!raw) { results.push({ toolCallId: tcId, result: JSON.stringify({ error: 'listing not found' }) }); continue }
          const listing = JSON.parse(raw)
          if (listing.host_uid && listing.host_uid !== callerUid) {
            results.push({ toolCallId: tcId, result: JSON.stringify({ error: 'this listing belongs to another host' }) })
            continue
          }
          // Type-coerce numeric fields; arrays for amenities; otherwise string.
          let coerced = value
          if (['bedrooms','bathrooms','maxGuests','nightlyPrice','cleaningFee','minNights'].includes(field)) {
            const n = Number(value)
            if (Number.isNaN(n)) { results.push({ toolCallId: tcId, result: JSON.stringify({ error: 'value must be a number' }) }); continue }
            coerced = n
          } else if (field === 'amenities') {
            coerced = Array.isArray(value) ? value : String(value).split(/[,;]\s*/).filter(Boolean)
          } else {
            coerced = String(value)
          }
          listing[field] = coerced
          // Recompute is_complete (address + price); demote to draft if needed.
          const addressOk = !!(listing.address && /,\s*[A-Za-z]{2,}/.test(listing.address))
          const priceOk = !!(listing.nightlyPrice && Number(listing.nightlyPrice) > 0)
          listing.is_complete = !!(addressOk && priceOk)
          if (listing.status === 'active' && !listing.is_complete) listing.status = 'draft'
          listing.updated_at = new Date().toISOString()
          await c.set(`bnbmesh:listing:${listingId}`, JSON.stringify(listing))
          results.push({ toolCallId: tcId, result: JSON.stringify({
            ok: true,
            listing_id: listingId,
            field,
            new_value: coerced,
            is_complete: listing.is_complete,
            status: listing.status,
          }) })
          continue
        }

        if (name === 'search_listings') {
          const out = await searchListings(args?.query || '', { timeoutMs: 2500 })
          const top = (out.results || []).slice(0, 4).map((x) => ({
            id: x.id,
            title: x.title,
            location: x.location,
            nightly_price_usd: x.nightlyPrice,
            cheapest_platform: x.cheapestPlatform,
            platforms: x.platforms,
            is_direct: !!x.isDirect,
          }))
          // Vapi feeds `result` (string) back to the LLM as a tool message.
          results.push({
            toolCallId: tcId,
            result: JSON.stringify({ source: out.source, results: top }),
          })
        } else {
          results.push({ toolCallId: tcId, result: JSON.stringify({ error: `Unknown tool: ${name}` }) })
        }
      } catch (e) {
        results.push({ toolCallId: tcId, result: JSON.stringify({ error: e.message }) })
      }
    }
    return json(200, { results })
  }

  // ---- Vapi browser-call lifecycle + public viewer ----------------------
  // POST /api/calls/{id}/start  — register a new call (mode, started_at)
  // POST /api/calls/{id}/turn   — append one transcript turn from the browser
  // POST /api/calls/{id}/end    — mark the call ended
  // POST /api/calls/{id}/context — inject a system message into the live Vapi call
  // GET  /api/calls/{id}        — read meta + transcript (public viewer polls this)
  // POST /api/vapi-webhook      — Vapi → us, optional dual-stream of transcript

  const callMatch = path.match(/^\/api\/calls\/([a-f0-9]{32})(?:\/(start|end|turn|context))?$/)
  if (callMatch) {
    const id = callMatch[1]
    const sub = callMatch[2] || ''
    if (!CALL_ID_RE.test(id)) return json(400, { error: 'bad call id' })
    const metaKey = `bnbmesh:call:${id}:meta`
    const turnsKey = `bnbmesh:call:${id}:turns`

    let body = null
    if (event.body) {
      try {
        body = event.isBase64Encoded
          ? JSON.parse(Buffer.from(event.body, 'base64').toString())
          : JSON.parse(event.body)
      } catch { /* tolerate bad json on GET */ }
    }

    if (method === 'GET' && !sub) {
      const c = await redis()
      if (!c) return json(503, { error: 'redis not configured' })
      const meta = await redisGet(metaKey)
      const turns = await c.lRange(turnsKey, 0, -1).catch(() => [])
      const parsed = (turns || []).map((t) => { try { return JSON.parse(t) } catch { return null } }).filter(Boolean)
      return json(200, { meta: meta || null, turns: parsed })
    }

    if (method === 'POST' && sub === 'start') {
      // If a host call is started by an authenticated user, capture their UID
      // so the resulting listing lands under their account, not the public
      // "anonymous listings" pool.
      let hostUid = null
      if (body?.mode === 'host') {
        const claims = await verifyFirebaseIdToken(event.headers?.authorization || event.headers?.Authorization)
        if (claims?.sub) hostUid = claims.sub
      }
      const meta = {
        id,
        mode:        body?.mode || 'support',
        status:      'in_progress',
        started_at:  body?.started_at || new Date().toISOString(),
        vapi_call_id: body?.vapi_call_id || null,
        host_uid:    hostUid,
      }
      await redisSetEx(metaKey, 7 * 24 * 3600, meta)
      return json(200, { ok: true, meta })
    }

    if (method === 'POST' && sub === 'turn') {
      if (!body?.role || !body?.text) return json(400, { error: 'missing role/text' })
      const c = await redis()
      if (!c) return json(503, { error: 'redis not configured' })
      const turn = { role: body.role, text: body.text, at: body.at || new Date().toISOString() }
      await c.rPush(turnsKey, JSON.stringify(turn))
      await c.expire(turnsKey, 7 * 24 * 3600)
      return json(200, { ok: true })
    }

    if (method === 'POST' && sub === 'end') {
      const meta = (await redisGet(metaKey)) || { id }
      meta.status = 'ended'
      meta.ended_at = body?.ended_at || new Date().toISOString()
      await redisSetEx(metaKey, 7 * 24 * 3600, meta)

      // If this was a host onboarding call, persist the captured listing.
      // We require enough fields to be useful (address or title, and price).
      if (meta.mode === 'host' && body?.listing && (body.listing.address || body.listing.title) && body.listing.nightlyPrice) {
        const listing = {
          ...body.listing,
          id,
          submitted_at: new Date().toISOString(),
          source_call_id: id,
          host_uid: meta.host_uid || null,
          customer_support_enabled: false,
        }
        const c = await redis()
        if (c) {
          await c.set(`bnbmesh:listing:${id}`, JSON.stringify(listing))
          await c.sAdd('bnbmesh:listings:index', id)
          // Add to the host's per-account index so their dashboard shows it.
          if (meta.host_uid) {
            await c.sAdd(`bnbmesh:host:${meta.host_uid}:listings`, id)
          }
          await c.expire(`bnbmesh:listing:${id}`, 90 * 24 * 3600)
        }
      }
      return json(200, { ok: true, meta })
    }

    if (method === 'POST' && sub === 'context') {
      const ctx = (body?.context || '').trim()
      if (!ctx) return json(400, { error: 'empty context' })
      // Append a synthetic system turn so the public viewer sees it immediately.
      const c = await redis()
      if (c) {
        const turn = { role: 'system', text: ctx, at: new Date().toISOString() }
        await c.rPush(turnsKey, JSON.stringify(turn))
        await c.expire(turnsKey, 7 * 24 * 3600)
      }
      // Forward to the live Vapi call if we know its id.
      const meta = await redisGet(metaKey)
      if (VAPI_PRIVATE_KEY && meta?.vapi_call_id) {
        try {
          await fetch(`${VAPI_API_BASE}/call/${meta.vapi_call_id}/control`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'add-message',
              message: { role: 'system', content: `Support agent context: ${ctx}` },
            }),
          })
        } catch (e) { console.warn('vapi control', e.message) }
      }
      return json(200, { ok: true })
    }

    return json(405, { error: 'method/sub not supported' })
  }

  // ---- Admin endpoints (Firebase-auth gated) ----------------------------

  if (path === '/api/admin/leads' || path === '/admin/leads') {
    const claims = await verifyFirebaseIdToken(event.headers?.authorization || event.headers?.Authorization)
    if (!isAdminClaims(claims)) return json(403, { error: 'admin only' })
    const c = await redis()
    if (!c) return json(503, { error: 'redis not configured' })
    const raw = await c.lRange('bnbmesh:leads:firehose', 0, 999).catch(() => [])
    const leads = raw.map((s) => { try { return JSON.parse(s) } catch { return null } }).filter(Boolean)
    return json(200, { leads })
  }

  if (path === '/api/admin/hosts' || path === '/admin/hosts') {
    const claims = await verifyFirebaseIdToken(event.headers?.authorization || event.headers?.Authorization)
    if (!isAdminClaims(claims)) return json(403, { error: 'admin only' })
    const c = await redis()
    if (!c) return json(200, { hosts: [] })
    const uids = await c.sMembers('bnbmesh:hosts:index').catch(() => [])
    const hosts = []
    for (const uid of uids) {
      try {
        const v = await c.get(`bnbmesh:host:${uid}`)
        if (v) hosts.push(JSON.parse(v))
      } catch {}
    }
    return json(200, { hosts })
  }

  // ---- Listings I own (auth'd) ------------------------------------------
  if (path === '/api/me/listings' || path === '/me/listings') {
    const claims = await verifyFirebaseIdToken(event.headers?.authorization || event.headers?.Authorization)
    if (!claims) return json(401, { error: 'sign in required' })

    if (method === 'POST') {
      // Create or upsert a listing under the current host.
      // Partial saves are allowed — listings start as 'draft' and can be
      // activated later from the dashboard once required fields are present.
      let body = {}
      try {
        body = event.body
          ? (event.isBase64Encoded ? JSON.parse(Buffer.from(event.body, 'base64').toString()) : JSON.parse(event.body))
          : {}
      } catch { return json(400, { error: 'bad json' }) }

      const c = await redis()
      if (!c) return json(503, { error: 'storage not configured' })

      const id = body.source_call_id || body.id || randomHex(16)
      // Idempotent upsert: preserve fields we don't want a save to clobber.
      let existing = null
      try {
        const raw = await c.get(`bnbmesh:listing:${id}`)
        if (raw) existing = JSON.parse(raw)
      } catch {}
      if (existing && existing.host_uid && existing.host_uid !== claims.sub) {
        return json(403, { error: 'this listing belongs to another host' })
      }

      const addr = (body.address || '').trim() || null
      const price = body.nightlyPrice != null && body.nightlyPrice !== '' ? Number(body.nightlyPrice) : null

      const listing = {
        // existing fields take lowest priority — body wins where provided
        ...(existing || {}),
        id,
        host_uid: claims.sub,
        address:       addr ?? existing?.address ?? null,
        title:         (body.title || '').trim() || existing?.title || null,
        description:   body.description ?? existing?.description ?? null,
        propertyType:  body.propertyType ?? existing?.propertyType ?? null,
        bedrooms:      body.bedrooms ?? existing?.bedrooms ?? null,
        bathrooms:     body.bathrooms ?? existing?.bathrooms ?? null,
        maxGuests:     body.maxGuests ?? existing?.maxGuests ?? null,
        amenities:     Array.isArray(body.amenities) ? body.amenities : (existing?.amenities || []),
        nightlyPrice:  price ?? existing?.nightlyPrice ?? null,
        cleaningFee:   body.cleaningFee != null && body.cleaningFee !== '' ? Number(body.cleaningFee) : (existing?.cleaningFee ?? null),
        minNights:     body.minNights ?? existing?.minNights ?? null,
        checkIn:       body.checkIn ?? existing?.checkIn ?? null,
        checkOut:      body.checkOut ?? existing?.checkOut ?? null,
        houseRules:    body.houseRules ?? existing?.houseRules ?? null,
        source_call_id: body.source_call_id || existing?.source_call_id || null,
        customer_support_enabled: existing?.customer_support_enabled ?? false,
        status:        existing?.status ?? 'draft',
        submitted_at:  existing?.submitted_at ?? new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      }
      // Compute completeness: address looks like "street, city, state" + nightly price.
      const addressLooksComplete = !!(listing.address && /,\s*[A-Za-z]{2,}/.test(listing.address))
      listing.is_complete = !!(addressLooksComplete && listing.nightlyPrice && listing.nightlyPrice > 0)

      // If a previously-active listing becomes incomplete (e.g. user blanked
      // the address), drop it back to draft.
      if (listing.status === 'active' && !listing.is_complete) {
        listing.status = 'draft'
      }

      await c.set(`bnbmesh:listing:${id}`, JSON.stringify(listing))
      await c.sAdd('bnbmesh:listings:index', id)
      await c.sAdd(`bnbmesh:host:${claims.sub}:listings`, id)
      await c.expire(`bnbmesh:listing:${id}`, 365 * 24 * 3600)
      return json(200, { ok: true, listing })
    }

    // GET — list mine
    const c = await redis()
    if (!c) return json(200, { listings: [] })
    const ids = await c.sMembers(`bnbmesh:host:${claims.sub}:listings`).catch(() => [])
    const listings = []
    for (const id of ids) {
      try {
        const v = await c.get(`bnbmesh:listing:${id}`)
        if (v) listings.push(JSON.parse(v))
      } catch {}
    }
    return json(200, { listings })
  }

  // ---- Admin: directly toggle a listing's customer_support_enabled flag
  // Bypasses Stripe checkout; intended for ops + comp / promo cases.
  if (path.match(/^\/api\/admin\/listings\/[A-Za-z0-9_-]+\/(enable|disable)-support$/)) {
    if (method !== 'POST') return json(405, { error: 'method not allowed' })
    const claims = await verifyFirebaseIdToken(event.headers?.authorization || event.headers?.Authorization)
    if (!isAdminClaims(claims)) return json(403, { error: 'admin only' })
    const m = path.match(/^\/api\/admin\/listings\/([A-Za-z0-9_-]+)\/(enable|disable)-support$/)
    const [, listingId, op] = m
    const c = await redis()
    if (!c) return json(503, { error: 'storage not configured' })
    const raw = await c.get(`bnbmesh:listing:${listingId}`)
    if (!raw) return json(404, { error: 'listing not found' })
    const listing = JSON.parse(raw)
    listing.customer_support_enabled = (op === 'enable')
    listing.support_updated_at = new Date().toISOString()
    listing.support_set_by = claims.email || claims.sub
    if (op === 'enable' && listing.status !== 'active') {
      listing.status = 'active'
      listing.activated_at = listing.activated_at || new Date().toISOString()
    }
    await c.set(`bnbmesh:listing:${listingId}`, JSON.stringify(listing))
    return json(200, { ok: true, listing })
  }

  // ---- Per-listing activate / deactivate --------------------------------
  const listingActionMatch = path.match(/^\/api\/me\/listings\/([A-Za-z0-9_-]+)\/(activate|deactivate)$/)
  if (listingActionMatch) {
    if (method !== 'POST') return json(405, { error: 'method not allowed' })
    const claims = await verifyFirebaseIdToken(event.headers?.authorization || event.headers?.Authorization)
    if (!claims) return json(401, { error: 'sign in required' })
    const [, listingId, action] = listingActionMatch
    const c = await redis()
    if (!c) return json(503, { error: 'storage not configured' })
    const raw = await c.get(`bnbmesh:listing:${listingId}`)
    if (!raw) return json(404, { error: 'listing not found' })
    const listing = JSON.parse(raw)
    if (listing.host_uid && listing.host_uid !== claims.sub) {
      return json(403, { error: 'not your listing' })
    }
    if (action === 'activate') {
      // Recompute completeness on the fly so legacy listings (saved before
      // is_complete existed) work without a manual re-save.
      const addressOk = !!(listing.address && /,\s*[A-Za-z]{2,}/.test(listing.address))
      const priceOk = !!(listing.nightlyPrice && Number(listing.nightlyPrice) > 0)
      if (!addressOk || !priceOk) {
        const missing = []
        if (!addressOk) missing.push('full address with city + state')
        if (!priceOk) missing.push('nightly price')
        return json(400, { error: `Cannot activate — still missing: ${missing.join(', ')}` })
      }
      listing.is_complete = true
      listing.status = 'active'
      listing.activated_at = new Date().toISOString()
    } else {
      listing.status = 'inactive'
      listing.deactivated_at = new Date().toISOString()
    }
    listing.host_uid = listing.host_uid || claims.sub  // backfill ownership for legacy
    await c.set(`bnbmesh:listing:${listingId}`, JSON.stringify(listing))
    await c.sAdd(`bnbmesh:host:${claims.sub}:listings`, listingId)
    return json(200, { ok: true, listing })
  }

  // ---- Stripe checkout: enable AI customer support for one listing ------
  // POST /api/billing/checkout { listing_id }
  if (path === '/api/billing/checkout' || path === '/billing/checkout') {
    if (method !== 'POST') return json(405, { error: 'method not allowed' })
    const claims = await verifyFirebaseIdToken(event.headers?.authorization || event.headers?.Authorization)
    if (!claims) return json(401, { error: 'sign in required' })

    let body = {}
    try {
      body = event.body
        ? (event.isBase64Encoded ? JSON.parse(Buffer.from(event.body, 'base64').toString()) : JSON.parse(event.body))
        : {}
    } catch { return json(400, { error: 'bad json' }) }

    const listingId = body?.listing_id
    if (!listingId) return json(400, { error: 'listing_id is required' })

    // Make sure the listing exists and belongs to this host before letting
    // them subscribe on its behalf.
    const c = await redis()
    if (!c) return json(503, { error: 'storage not configured' })
    const raw = await c.get(`bnbmesh:listing:${listingId}`)
    if (!raw) return json(404, { error: 'listing not found' })
    let listing
    try { listing = JSON.parse(raw) } catch { return json(500, { error: 'corrupt listing' }) }
    if (listing.host_uid && listing.host_uid !== claims.sub) {
      return json(403, { error: 'this listing is not yours' })
    }
    if (listing.status !== 'active') {
      return json(400, { error: 'listing must be active before enabling customer support — activate it first' })
    }
    if (listing.customer_support_enabled) {
      return json(409, { error: 'AI customer support is already active on this listing' })
    }

    const sk = await ssmGet(`${SSM_BASE}/stripe_secret_key`)
    const priceId = await ssmGet(`${SSM_BASE}/stripe_price_id`)
    if (!sk || !priceId) {
      return json(503, { error: 'Stripe not configured yet — admin needs to set SSM params.' })
    }

    const origin = (event.headers?.origin || event.headers?.Origin || 'https://bnbmesh.ai')
      .replace(/\/$/, '')
    const params = new URLSearchParams()
    params.set('mode', 'subscription')
    params.set('line_items[0][price]', priceId)
    params.set('line_items[0][quantity]', '1')
    // Lets users enter promotion codes (e.g. FIRSTMONTHFREE) on the Checkout
    // page. Subscription mode still requires a payment method.
    params.set('allow_promotion_codes', 'true')
    params.set('client_reference_id', claims.sub)
    if (claims.email) params.set('customer_email', claims.email)
    params.set('success_url', `${origin}/#dashboard?support=enabled&listing=${encodeURIComponent(listingId)}`)
    params.set('cancel_url',  `${origin}/#dashboard?support=cancel`)
    params.set('metadata[firebase_uid]', claims.sub)
    params.set('metadata[listing_id]', listingId)
    if (claims.email) params.set('metadata[firebase_email]', claims.email)
    if (claims.phone_number) params.set('metadata[firebase_phone]', claims.phone_number)
    // Subscription-level metadata too, so future renewal/update events carry it.
    params.set('subscription_data[metadata][firebase_uid]', claims.sub)
    params.set('subscription_data[metadata][listing_id]', listingId)

    try {
      const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sk}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })
      const data = await resp.json()
      if (!resp.ok) {
        console.warn('stripe checkout error', data)
        return json(502, { error: data?.error?.message || 'stripe error' })
      }

      // Track that the host has at least started a checkout (admin visibility).
      const host = (await redisGet(`bnbmesh:host:${claims.sub}`)) || {
        uid: claims.sub,
        email: claims.email || null,
        phone: claims.phone_number || null,
        created_at: new Date().toISOString(),
      }
      host.last_checkout_session_id = data.id
      host.last_checkout_listing_id = listingId
      host.last_checkout_started_at = new Date().toISOString()
      await c.set(`bnbmesh:host:${claims.sub}`, JSON.stringify(host))
      await c.sAdd('bnbmesh:hosts:index', claims.sub)

      return json(200, { url: data.url, session_id: data.id })
    } catch (e) {
      return json(502, { error: e.message })
    }
  }

  // ---- Stripe webhook ---------------------------------------------------
  // Verifies signature; on subscription.created/updated, advances host status.
  if (path === '/api/billing/webhook' || path === '/billing/webhook') {
    if (method !== 'POST') return json(405, {})
    const wh = await ssmGet(`${SSM_BASE}/stripe_webhook_secret`)
    const raw = event.body
      ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body)
      : ''

    // Optional: verify signature when wh is set. Skipped if no secret yet.
    if (wh) {
      const sig = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature']
      if (!verifyStripeSignature(raw, sig, wh)) return json(400, { error: 'bad signature' })
    }

    let evt
    try { evt = JSON.parse(raw) } catch { return json(400, { error: 'bad json' }) }

    const obj = evt.data?.object || {}
    const uid = obj.metadata?.firebase_uid || obj.client_reference_id

    // Belt-and-suspenders: this Stripe account is shared with other products
    // (voicecert, etc.). Webhook endpoints receive events for the whole
    // account, so we must filter to events that look like ours. We accept an
    // event if it carries our firebase_uid metadata OR references our price.
    const ourPrice = process.env.STRIPE_PRICE_ID
    const eventPriceId =
      obj?.items?.data?.[0]?.price?.id ||           // subscription objects
      obj?.lines?.data?.[0]?.price?.id ||           // invoice objects
      obj?.line_items?.data?.[0]?.price?.id ||      // checkout.session.completed
      null
    const isOurEvent = !!uid || (ourPrice && eventPriceId === ourPrice)
    if (!isOurEvent) {
      // Quietly 200 so Stripe doesn't retry; this event belongs to a sibling product.
      return json(200, { received: true, ignored: true })
    }

    if (uid) {
      const c = await redis()
      if (c) {
        // listing_id is on either the session metadata or the subscription metadata
        const listingId = obj.metadata?.listing_id || null
        const existing = await redisGet(`bnbmesh:host:${uid}`) || {}
        const host = { ...existing, uid }
        if (evt.type === 'checkout.session.completed') {
          host.status = 'active'
          host.stripe_customer_id = obj.customer || host.stripe_customer_id
          host.stripe_subscription_id = obj.subscription || host.stripe_subscription_id
          host.activated_at = new Date().toISOString()
        } else if (evt.type === 'customer.subscription.deleted') {
          host.status = 'canceled'
          host.canceled_at = new Date().toISOString()
        } else if (evt.type === 'customer.subscription.updated') {
          host.status = obj.status || host.status
        }
        await c.set(`bnbmesh:host:${uid}`, JSON.stringify(host))
        await c.sAdd('bnbmesh:hosts:index', uid)

        // Flip the listing's customer_support_enabled flag based on the event.
        if (listingId) {
          const lraw = await c.get(`bnbmesh:listing:${listingId}`)
          if (lraw) {
            try {
              const listing = JSON.parse(lraw)
              if (evt.type === 'checkout.session.completed' || evt.type === 'customer.subscription.updated') {
                const stillActive = (evt.type === 'checkout.session.completed')
                  ? true
                  : (obj.status === 'active' || obj.status === 'trialing')
                listing.customer_support_enabled = stillActive
                listing.stripe_subscription_id = obj.subscription || obj.id || listing.stripe_subscription_id
                listing.support_updated_at = new Date().toISOString()
              } else if (evt.type === 'customer.subscription.deleted') {
                listing.customer_support_enabled = false
                listing.support_canceled_at = new Date().toISOString()
              }
              await c.set(`bnbmesh:listing:${listingId}`, JSON.stringify(listing))
            } catch (e) { console.warn('listing update failed', e.message) }
          }
        }
      }
    }
    return json(200, { received: true })
  }

  // ---- Lead capture (WIP disclaimer popup) -----------------------------
  // POST /api/leads { email, intent: 'notify' | 'investor' | 'partner', source }
  // Stores in Redis; never returns existing leads to clients.
  if (path === '/api/leads' || path === '/leads') {
    if (method !== 'POST') return json(405, { error: 'method not allowed' })
    let body = {}
    try {
      body = event.body
        ? (event.isBase64Encoded ? JSON.parse(Buffer.from(event.body, 'base64').toString()) : JSON.parse(event.body))
        : {}
    } catch { return json(400, { error: 'bad json' }) }
    const email = (body.email || '').trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: 'invalid email' })
    }
    const intent = ['notify', 'investor', 'partner'].includes(body.intent) ? body.intent : 'notify'
    const source = (body.source || 'disclaimer').slice(0, 64)
    const lead = { email, intent, source, captured_at: new Date().toISOString() }
    const c = await redis()
    if (c) {
      await c.set(`bnbmesh:lead:${email}`, JSON.stringify(lead))
      await c.sAdd('bnbmesh:leads:index', email)
      await c.lPush('bnbmesh:leads:firehose', JSON.stringify(lead))
      await c.lTrim('bnbmesh:leads:firehose', 0, 999)
    }
    return json(200, { ok: true })
  }

  // Vapi → us webhook. If you set this URL on the assistant, we'll mirror the
  // server-side transcript into the same Redis keys keyed by our 32-char id
  // (passed via assistantOverrides.metadata.bnbmesh_call_id from the browser).
  if (path === '/api/vapi-webhook') {
    if (method !== 'POST') return json(405, {})
    let body = {}
    try {
      body = event.body
        ? (event.isBase64Encoded ? JSON.parse(Buffer.from(event.body, 'base64').toString()) : JSON.parse(event.body))
        : {}
    } catch {}
    const callId = body?.message?.call?.metadata?.bnbmesh_call_id
                || body?.call?.metadata?.bnbmesh_call_id
    if (callId && CALL_ID_RE.test(callId) && body?.message?.type === 'transcript' && body?.message?.transcriptType === 'final') {
      const turn = {
        role: body.message.role,
        text: body.message.transcript,
        at: new Date().toISOString(),
      }
      const c = await redis()
      if (c) {
        await c.rPush(`bnbmesh:call:${callId}:turns`, JSON.stringify(turn))
        await c.expire(`bnbmesh:call:${callId}:turns`, 7 * 24 * 3600)
      }
    }
    return json(200, { ok: true })
  }

  if (path === '/api/mcp' || path === '/mcp') {
    if (method === 'GET') {
      return json(200, {
        server: 'bnbmesh',
        protocol: 'mcp',
        transport: 'streamable-http',
        usage: 'POST JSON-RPC 2.0 requests to this URL',
        tools: MCP_TOOLS.map((t) => t.name),
      })
    }
    if (method !== 'POST') return json(405, { error: 'method not allowed' })

    let body
    try {
      body = event.body
        ? (event.isBase64Encoded ? JSON.parse(Buffer.from(event.body, 'base64').toString()) : JSON.parse(event.body))
        : null
    } catch {
      return json(400, mcpError(null, -32700, 'parse error'))
    }
    if (!body) return json(400, mcpError(null, -32600, 'invalid request'))

    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((r) => handleMcp(r, event)))).filter(Boolean)
      return json(200, out)
    }
    const out = await handleMcp(body, event)
    if (out === null) return json(204, '')
    return json(200, out)
  }

  return json(404, { error: 'not found', path })
}
