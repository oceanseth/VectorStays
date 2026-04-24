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

const TINYFISH_API_KEY      = process.env.TINYFISH_API_KEY || ''
const TINYFISH_API_BASE     = process.env.TINYFISH_API_BASE || 'https://agent.tinyfish.ai/v1'
const REDIS_URL             = process.env.REDIS_URL || ''
const VAPI_PRIVATE_KEY      = process.env.VAPI_PRIVATE_KEY || ''
const VAPI_API_BASE         = 'https://api.vapi.ai'
const X402_PAYMENT_ADDRESS  = process.env.X402_PAYMENT_ADDRESS || '0x0000000000000000000000000000000000000000'
const X402_PRICE_USD        = process.env.X402_PRICE_USD || '0.05'

// Call IDs are 32-char hex (128 bits). Reject anything else immediately.
const CALL_ID_RE = /^[a-f0-9]{32}$/

const PLATFORMS = ['airbnb', 'vrbo', 'homeaway', 'direct']

// ---------------------------------------------------------------------------
// Mock search — deterministic fallback so demos look consistent.
// ---------------------------------------------------------------------------

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
  return samples.map((s, i) => {
    const base = 120 + ((seed + i * 37) % 280)
    const platforms = Object.fromEntries(
      PLATFORMS.map((p, j) => [p, Math.round(base * (1 + ((seed >> (j + 1)) & 0x1f) / 100))])
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

// Upstash Redis is the cache of record. In-memory Map is a per-Lambda-container
// L1 on top so the same warm container doesn't pay a Redis round-trip twice.
const L1_CACHE = new Map()
const SEARCH_TTL_SECONDS = 10 * 60

async function searchListings(query, { timeoutMs = 22000 } = {}) {
  if (!TINYFISH_API_KEY) {
    return { source: 'mock', results: mockSearchResults(query) }
  }
  const cacheKey = `bnbmesh:search:${query.trim().toLowerCase()}`
  // L1 (in-memory)
  const l1 = L1_CACHE.get(cacheKey)
  if (l1 && l1.expires > Date.now()) {
    return { source: 'cache-l1', results: l1.results }
  }
  // L2 (Upstash Redis)
  if (redisConfigured()) {
    const cached = await redisGet(cacheKey)
    if (cached && Array.isArray(cached)) {
      L1_CACHE.set(cacheKey, { results: cached, expires: Date.now() + 60_000 })
      return { source: 'redis', results: cached }
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
    return { source: 'tinyfish', results }
  } catch (e) {
    console.warn('tinyfish threw:', e.message)
    return { source: 'mock', fallback_reason: e.message, results: mockSearchResults(query) }
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
    // Allow caller to override timeout (e.g. direct Lambda invoke for pre-warm,
    // which isn't bound by the 29s API Gateway cap).
    const live = event.queryStringParameters?.live === '1'
    const timeoutMs = live ? 55000 : 22000
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
      const meta = {
        id,
        mode:        body?.mode || 'support',
        status:      'in_progress',
        started_at:  body?.started_at || new Date().toISOString(),
        vapi_call_id: body?.vapi_call_id || null,
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
