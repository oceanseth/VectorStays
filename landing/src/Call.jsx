import { useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import VapiSDK from '@vapi-ai/web'
// @vapi-ai/web ships as CJS with `exports.default = Vapi`. Depending on
// whether Vite hoists this through esbuild (dev) or Rollup (build), the
// default import is sometimes the constructor and sometimes a module object.
// Pick whichever is callable.
const Vapi = typeof VapiSDK === 'function' ? VapiSDK : VapiSDK?.default

const VAPI_PUBLIC_KEY = '5c140bc1-303b-495f-88c0-ee5e87baefac'

// Module-level singleton so the underlying Daily/Krisp WebRTC stack is
// initialized exactly once per page. If we `new Vapi()` more than once,
// Krisp throws "KrispSDK is duplicated".
let _vapi = null
function getVapi() {
  if (!_vapi) _vapi = new Vapi(VAPI_PUBLIC_KEY)
  return _vapi
}

const ASSISTANTS = {
  support: 'c0eea2d1-d2a7-4bb5-bcc2-04d2c988028e',
  host:    '67246d25-8651-41fa-ab44-888c95dc0683',
}

// 32-char hex; ~128 bits of entropy. CloudFront protects against guessing.
function makeCallId() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Listing form schema — the assistant calls update_listing(...) with any
// subset of these fields whenever it captures one during the conversation.
// ---------------------------------------------------------------------------

const LISTING_FIELDS = [
  { key: 'address',       label: 'Property address',  type: 'text', placeholder: '123 Main St, Santa Barbara CA' },
  { key: 'propertyType',  label: 'Property type',     type: 'select', options: ['entire-place', 'private-room', 'shared-room'] },
  { key: 'bedrooms',      label: 'Bedrooms',          type: 'number' },
  { key: 'bathrooms',     label: 'Bathrooms',         type: 'number' },
  { key: 'maxGuests',     label: 'Max guests',        type: 'number' },
  { key: 'title',         label: 'Listing title',     type: 'text', placeholder: 'Sunny Mesa Loft with Ocean View' },
  { key: 'description',   label: 'Description',       type: 'textarea' },
  { key: 'amenities',     label: 'Amenities',         type: 'tags', placeholder: 'wifi, kitchen, parking, pool' },
  { key: 'nightlyPrice',  label: 'Nightly price (USD)', type: 'number' },
  { key: 'cleaningFee',   label: 'Cleaning fee (USD)', type: 'number' },
  { key: 'minNights',     label: 'Minimum nights',    type: 'number' },
  { key: 'checkIn',       label: 'Check-in time',     type: 'text', placeholder: '3:00 PM' },
  { key: 'checkOut',      label: 'Check-out time',    type: 'text', placeholder: '11:00 AM' },
  { key: 'houseRules',    label: 'House rules',       type: 'textarea' },
]

const HOST_SYSTEM_PROMPT = `You are the BnBMesh host onboarding agent. Your goal is to collect the information needed to publish a short-term rental listing — address, property type, bedrooms, bathrooms, max guests, title, description, amenities, nightly price, cleaning fee, minimum nights, check-in/check-out times, and house rules.

Have a natural, friendly conversation. Ask ONE question at a time. Confirm briefly and move on. Don't read back the full form unless the host asks. End the call by summarizing the listing in two sentences.

CRITICAL: As soon as you learn the value of any field, call the update_listing function with JUST that field. Do not wait until the end. Update the form continuously as the conversation progresses. If the host changes a value, call update_listing again with the new value. The host can also see the form on screen and may type changes themselves; trust whatever value is already in the form unless they say otherwise.

Examples:
- Host: "It's at 123 Main Street, Santa Barbara." → call update_listing({ address: "123 Main St, Santa Barbara, CA" })
- Host: "Three bedrooms, two baths, sleeps six." → call update_listing({ bedrooms: 3, bathrooms: 2, maxGuests: 6 })
- Host: "We charge two hundred a night plus seventy-five for cleaning." → call update_listing({ nightlyPrice: 200, cleaningFee: 75 })`

const UPDATE_LISTING_TOOL = {
  type: 'function',
  async: true, // fire-and-forget — the assistant doesn't need a response
  function: {
    name: 'update_listing',
    description: 'Update one or more fields on the listing form. Call this immediately whenever you learn a value during the conversation. Pass only the fields you just learned.',
    parameters: {
      type: 'object',
      properties: {
        address:       { type: 'string' },
        propertyType:  { type: 'string', enum: ['entire-place', 'private-room', 'shared-room'] },
        bedrooms:      { type: 'number' },
        bathrooms:     { type: 'number' },
        maxGuests:     { type: 'number' },
        title:         { type: 'string' },
        description:   { type: 'string' },
        amenities:     { type: 'array', items: { type: 'string' } },
        nightlyPrice:  { type: 'number' },
        cleaningFee:   { type: 'number' },
        minNights:     { type: 'number' },
        checkIn:       { type: 'string' },
        checkOut:      { type: 'string' },
        houseRules:    { type: 'string' },
      },
    },
  },
}

// ---------------------------------------------------------------------------
// Form sub-component — controlled inputs, highlights the most-recently-updated field.
// ---------------------------------------------------------------------------

function ListingForm({ values, onChange, recentlyUpdated }) {
  return (
    <div className="listing-form">
      <h4 className="listing-form-title">Your listing</h4>
      <p className="listing-form-hint">The agent fills this in as you talk. Type to override anything.</p>
      {LISTING_FIELDS.map((f) => {
        const v = values[f.key] ?? ''
        const cls = `listing-field${recentlyUpdated === f.key ? ' is-fresh' : ''}`
        return (
          <div key={f.key} className={cls}>
            <label htmlFor={`field-${f.key}`}>{f.label}</label>
            {f.type === 'textarea' ? (
              <textarea
                id={`field-${f.key}`}
                value={v}
                rows={3}
                placeholder={f.placeholder || ''}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            ) : f.type === 'select' ? (
              <select
                id={`field-${f.key}`}
                value={v}
                onChange={(e) => onChange(f.key, e.target.value)}
              >
                <option value=""></option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'number' ? (
              <input
                id={`field-${f.key}`}
                type="number"
                value={v}
                onChange={(e) => onChange(f.key, e.target.value === '' ? '' : Number(e.target.value))}
              />
            ) : f.type === 'tags' ? (
              <input
                id={`field-${f.key}`}
                type="text"
                value={Array.isArray(v) ? v.join(', ') : v}
                placeholder={f.placeholder || ''}
                onChange={(e) => onChange(f.key, e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
              />
            ) : (
              <input
                id={`field-${f.key}`}
                type="text"
                value={v}
                placeholder={f.placeholder || ''}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main call modal
// ---------------------------------------------------------------------------

export default function Call({ mode = 'support', onSignInRequest, onBecomeHostRequest, onAddListingRequest, onClose }) {
  const { user, getIdToken } = useAuth()
  // Mirror the auth user into a ref so callbacks (start, restartWithContext)
  // pick up the latest value without stale closures.
  const currentUserRef = useRef(null)
  useEffect(() => { currentUserRef.current = user }, [user])
  const [status, setStatus] = useState('idle') // idle | connecting | live | ended | error
  const [transcript, setTranscript] = useState([])
  const [callId] = useState(makeCallId)
  const [shareCopied, setShareCopied] = useState(false)
  const [error, setError] = useState(null)
  const [listing, setListing] = useState({})
  const [recentField, setRecentField] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | failed
  const [saveError, setSaveError] = useState(null)
  // Support-mode contextual prompts the agent triggers via tool calls.
  // Each is { type, label, onClick, dismissedAt }
  const [prompts, setPrompts] = useState([])
  // Distinguishes "user closed the modal" from "Vapi disconnected for any
  // other reason" — only the former actually ends the modal. Anything else
  // is silently re-connected so the user feels like they're in one continuous
  // conversation.
  const userEndedRef = useRef(false)
  const transcriptRef2 = useRef([])     // ref-mirror of transcript for restart context
  const restartCountRef = useRef(0)     // prevent infinite restart loops on hard failures
  const restartTimerRef = useRef(null)
  const vapiRef = useRef(null)
  const transcriptRef = useRef(null)
  const listingRef = useRef({})

  // Keep listingRef in sync so async callbacks (tool handlers, save) read
  // the latest form state without stale-closure bugs.
  useEffect(() => { listingRef.current = listing }, [listing])

  const isHost = mode === 'host'
  const shareUrl = `${window.location.origin}/#call-${callId}`

  // ---- Vapi setup -------------------------------------------------------
  useEffect(() => {
    // Reuse the page-level Vapi instance to keep Krisp from double-initializing.
    const vapi = getVapi()
    vapiRef.current = vapi
    // Clear any stale listeners from a previous Call modal mount.
    try { vapi.removeAllListeners?.() } catch {}

    vapi.on('call-start', async () => {
      setStatus('live')
      const headers = { 'content-type': 'application/json' }
      // For host onboarding calls, attach the user's ID token so the listing
      // gets saved under their account.
      if (isHost) {
        try {
          const token = await getIdToken?.()
          if (token) headers.authorization = `Bearer ${token}`
        } catch {}
      }
      fetch(`/api/calls/${callId}/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode, started_at: new Date().toISOString() }),
      }).catch(() => {})
    })

    vapi.on('call-end', () => {
      fetch(`/api/calls/${callId}/end`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ended_at: new Date().toISOString(), listing: isHost ? listing : null }),
      }).catch(() => {})

      // If the user clicked Close (or the X), stop here.
      if (userEndedRef.current) {
        setStatus('ended')
        return
      }

      // Otherwise treat this as a Vapi-side disconnect (silence timeout,
      // network blip, etc.) and seamlessly start a new call with the
      // prior transcript injected as system context. To the user, the
      // conversation just continues.
      if (restartCountRef.current >= 4) {
        // Vapi keeps disconnecting — something is wrong. Surface it.
        setStatus('error')
        setError('Voice connection keeps dropping. Refresh the page to try again.')
        return
      }
      restartCountRef.current += 1
      // Brief debounce so the underlying Daily/Krisp transport can finish
      // tearing down the previous call before we open a new one. Going below
      // ~400ms can race the cleanup and re-trigger the Krisp duplicate error.
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = setTimeout(() => {
        if (userEndedRef.current) return
        restartWithContext()
      }, 600)
    })

    vapi.on('error', (e) => {
      console.error('vapi err', e)
      // Vapi sometimes puts the API response object on e.message — coerce
      // anything non-string to JSON so React doesn't choke on rendering.
      const raw = e?.error?.message ?? e?.message ?? e?.error ?? e
      const msg = typeof raw === 'string' ? raw : (() => {
        try { return JSON.stringify(raw) } catch { return 'unknown error' }
      })()
      setError(msg)
      setStatus('error')
    })

    vapi.on('message', (msg) => {
      if (msg.type === 'transcript' && msg.transcriptType === 'final') {
        const turn = { role: msg.role, text: msg.transcript, at: new Date().toISOString() }
        setTranscript((t) => {
          const next = [...t, turn]
          transcriptRef2.current = next
          return next
        })
        fetch(`/api/calls/${callId}/turn`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(turn),
        }).catch(() => {})
        return
      }
      // Vapi tool-calls — handle update_listing / submit_listing (host mode)
      // and search_listings / prompt_* (support mode).
      if (msg.type === 'tool-calls' && Array.isArray(msg.toolCallList)) {
        for (const tc of msg.toolCallList) {
          const name = tc?.function?.name || tc?.name
          const tcId = tc?.id || tc?.toolCallId
          let args = tc?.function?.arguments ?? tc?.arguments ?? {}
          if (typeof args === 'string') {
            try { args = JSON.parse(args) } catch { args = {} }
          }

          // host mode tools
          if (name === 'update_listing') {
            applyListingPatch(args)
            continue
          }
          if (name === 'submit_listing') {
            saveListing({ endCall: false }) // don't end the call from a tool
            continue
          }

          // support mode tools
          if (name === 'search_listings') {
            handleSearchListings(args?.query || '', tcId)
            continue
          }
          if (name === 'prompt_signin') {
            addPrompt({ type: 'signin', label: 'Sign in', onClick: () => onSignInRequest?.() })
            continue
          }
          if (name === 'prompt_become_host') {
            addPrompt({ type: 'become_host', label: 'Become a Host', onClick: () => onBecomeHostRequest?.() })
            continue
          }
          if (name === 'prompt_add_listing') {
            addPrompt({ type: 'add_listing', label: 'Add a listing', onClick: () => onAddListingRequest?.() })
            continue
          }
          if (name === 'prompt_connect_guesty') {
            addPrompt({ type: 'connect_guesty', label: 'Connect Guesty (coming soon)', onClick: () => alert('Guesty integration is in active development — your data hooks will land in v2.') })
            continue
          }
        }
      }
    })

    return () => {
      // Don't destroy the singleton — just hang up and detach our listeners
      // so the next Call modal mount can wire its own.
      try { vapi.stop() } catch {}
      try { vapi.removeAllListeners?.() } catch {}
      clearTimeout(restartTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, mode])

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [transcript])

  // ---- Tool-call handlers (support mode) -------------------------------

  const addPrompt = (p) => {
    setPrompts((prev) => {
      // Don't add duplicates of the same prompt type within the same call.
      if (prev.some((x) => x.type === p.type)) return prev
      return [...prev, { ...p, ts: Date.now() }]
    })
  }
  const dismissPrompt = (type) => {
    setPrompts((prev) => prev.filter((p) => p.type !== type))
  }

  const sendToolResult = (toolCallId, result) => {
    if (!toolCallId || !vapiRef.current) return
    try {
      vapiRef.current.send({
        type: 'add-message',
        message: {
          role: 'tool',
          toolCallId,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        },
      })
    } catch (e) { console.warn('vapi tool-result send failed:', e.message) }
  }

  const handleSearchListings = async (query, toolCallId) => {
    try {
      // ?fast=1 caps the Lambda timeout at 2.5s so the agent's tool call
      // returns inside Vapi's tool budget and the call doesn't stall.
      const r = await fetch(`/api/search?fast=1&q=${encodeURIComponent(query)}`)
      const j = await r.json()
      const top = (j.results || []).slice(0, 4).map((x) => ({
        id: x.id,
        title: x.title,
        location: x.location,
        nightly_price_usd: x.nightlyPrice,
        cheapest_platform: x.cheapestPlatform,
        platforms: x.platforms,
        is_direct: !!x.isDirect,
      }))
      sendToolResult(toolCallId, { source: j.source, results: top })
    } catch (e) {
      sendToolResult(toolCallId, { error: e.message, results: [] })
    }
  }

  // Apply a partial-update patch from either tool-call or manual edit.
  const applyListingPatch = (patch) => {
    if (!patch || typeof patch !== 'object') return
    const keys = Object.keys(patch)
    if (!keys.length) return
    setListing((prev) => ({ ...prev, ...patch }))
    setRecentField(keys[0])
    setTimeout(() => setRecentField((curr) => (curr === keys[0] ? null : curr)), 1800)
  }

  const onFieldChange = (key, value) => {
    setListing((prev) => ({ ...prev, [key]: value }))
    if (saveState === 'saved') setSaveState('idle') // edits invalidate the saved state
  }

  // Allow saving anything — drafts are valid. The dashboard will gate
  // activation/customer-support on completeness server-side.
  const hasAnyField = isHost && Object.values(listingRef.current || {}).some(
    (v) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0),
  )
  const canSave = hasAnyField

  // Save the current listing under the host's account. Used both by the
  // explicit "Save" button and the agent's `submit_listing` tool call.
  const saveListing = async ({ endCall = false } = {}) => {
    if (saveState === 'saving') return
    setSaveState('saving'); setSaveError(null)
    try {
      const token = await getIdToken?.()
      if (!token) throw new Error('Sign in required to save a listing.')
      const payload = {
        ...listingRef.current,
        source_call_id: callId,
      }
      const r = await fetch('/api/me/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setSaveState('saved')
      if (endCall) {
        try { vapiRef.current?.stop() } catch {}
      }
    } catch (e) {
      setSaveState('failed')
      setSaveError(e.message)
    }
  }

  // ---- Start / stop -----------------------------------------------------

  const start = async () => {
    setStatus('connecting')
    setError(null)
    try {
      // Tools + system prompt live on the assistant (PATCH'd via the Vapi
      // API). Metadata travels with every server tool-call so the Lambda
      // knows which signed-in user is on the line — needed for
      // list_my_listings and edit_listing to enforce ownership.
      await vapiRef.current.start(ASSISTANTS[mode], {
        metadata: {
          bnbmesh_call_id: callId,
          mode,
          firebase_uid:   currentUserRef.current?.uid   || null,
          firebase_email: currentUserRef.current?.email || null,
        },
      })
    } catch (e) {
      const raw = e?.message ?? e
      setError(typeof raw === 'string' ? raw : (() => { try { return JSON.stringify(raw) } catch { return 'could not start call' } })())
      setStatus('error')
    }
  }

  const stop = () => {
    userEndedRef.current = true
    try { vapiRef.current?.stop() } catch {}
  }

  // Seamless reconnect with prior transcript baked into a system message.
  // The user shouldn't notice the call ended at all — to them it's still
  // the same conversation.
  const restartWithContext = async () => {
    if (userEndedRef.current) return
    setError(null)
    // Briefly show 'connecting' so the indicator dot flickers, then 'live'
    setStatus('connecting')
    try {
      const recent = transcriptRef2.current.slice(-12)  // last ~6 exchanges
      const summary = recent.map((t) => `${t.role === 'assistant' ? 'agent' : 'user'}: ${t.text}`).join('\n')
      const overrides = {
        metadata: {
          bnbmesh_call_id: callId,
          mode,
          restart: true,
          firebase_uid:   currentUserRef.current?.uid   || null,
          firebase_email: currentUserRef.current?.email || null,
        },
      }
      if (recent.length > 0) {
        // The voice channel briefly dropped. Prepend a system note to the
        // assistant's prompt so it picks up where it left off without
        // making the user repeat themselves.
        overrides.firstMessage = ''  // don't greet — slip back into the conversation
        overrides.model = {
          messages: [{
            role: 'system',
            content: `IMPORTANT: this is a CONTINUATION of a conversation that briefly disconnected. Do not greet again. Do not say hello. Just listen for the user to continue speaking, and respond contextually based on what was just discussed.\n\nRECENT TRANSCRIPT (most recent last):\n${summary}\n\nResume naturally — the user is still mid-conversation.`,
          }],
        }
      }
      await vapiRef.current.start(ASSISTANTS[mode], overrides)
    } catch (e) {
      const raw = e?.message ?? e
      setError(typeof raw === 'string' ? raw : (() => { try { return JSON.stringify(raw) } catch { return 'could not reconnect' } })())
      setStatus('error')
    }
  }

  const closeModal = () => {
    userEndedRef.current = true
    try { vapiRef.current?.stop() } catch {}
    onClose?.()
  }

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 1800)
    } catch {}
  }

  // ---- Render -----------------------------------------------------------

  return (
    <div className="callmodal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}>
      <div className={`callmodal ${isHost ? 'callmodal-wide' : ''}`}>
        <div className="callmodal-head">
          <h3>{isHost ? 'Become a Host' : 'BnBMesh Voice Support'}</h3>
          <button className="callmodal-close" onClick={closeModal} aria-label="Close">×</button>
        </div>

        <div className={`callmodal-body ${isHost ? 'callmodal-body-split' : ''}`}>
          <div className="callmodal-pane">
            {status === 'idle' && (
              <div className="callmodal-intro">
                {isHost ? (
                  <p>
                    Talk to our onboarding agent. They'll ask about your place —
                    address, beds, price, amenities — and the form on the right will
                    fill in as you talk. Edit anything by typing.
                  </p>
                ) : (
                  <>
                    <p style={{ marginBottom: 10 }}>Talk to an agent about:</p>
                    <ul className="callmodal-bullets">
                      <li><strong>Hosts</strong> — customer support voice agents, direct listings, operations agents</li>
                      <li><strong>Guests</strong> — booking, finding reservations, in-stay help</li>
                      <li><strong>FAQ</strong> — partners, city / government access, anything else</li>
                    </ul>
                  </>
                )}
                <button className="btn btn-primary callmodal-cta" onClick={start}>
                  {isHost ? 'Start onboarding call' : 'Start call'}
                </button>
                <p className="callmodal-hint">Browser will ask for microphone access.</p>
              </div>
            )}

            {(status === 'connecting' || status === 'live' || status === 'ended') && (
              <>
                <div className="callmodal-status">
                  <span className={`status-dot status-${status}`}></span>
                  <span>{status === 'connecting' ? 'Connecting…' : status === 'live' ? 'Connected' : 'Call ended'}</span>
                </div>

                <div className="callmodal-transcript" ref={transcriptRef}>
                  {transcript.length === 0 && status !== 'ended' && (
                    <p className="callmodal-tip">Say something — the transcript will appear here.</p>
                  )}
                  {transcript.map((t, i) => (
                    <div key={i} className={`turn turn-${t.role}`}>
                      <span className="turn-role">{t.role === 'assistant' ? 'agent' : 'you'}</span>
                      <span className="turn-text">{t.text}</span>
                    </div>
                  ))}
                </div>

                <div className="callmodal-share">
                  <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
                  <button className="btn btn-ghost btn-sm" onClick={copyShare}>{shareCopied ? 'Copied' : 'Share'}</button>
                </div>

                {/* Contextual action buttons surfaced by the agent (support mode). */}
                {!isHost && prompts.length > 0 && (
                  <div className="callmodal-prompts">
                    {prompts.map((p) => (
                      <div key={p.type} className="callmodal-prompt">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => { p.onClick?.(); dismissPrompt(p.type) }}
                        >
                          {p.label}
                        </button>
                        <button className="callmodal-prompt-x" onClick={() => dismissPrompt(p.type)} aria-label="dismiss">×</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="callmodal-actions">
                  {(status === 'live' || status === 'connecting' || status === 'ended') && (
                    <button className="btn btn-danger" onClick={closeModal}>End call</button>
                  )}
                </div>
              </>
            )}

            {status === 'error' && (
              <div className="callmodal-error">
                <p><strong>Couldn't start the call.</strong></p>
                <p className="callmodal-tip">{error}</p>
                <button className="btn btn-ghost" onClick={onClose}>Close</button>
              </div>
            )}
          </div>

          {isHost && (
            <div className="callmodal-pane callmodal-form-pane">
              <ListingForm values={listing} onChange={onFieldChange} recentlyUpdated={recentField} />

              <div className="listing-save">
                {saveState === 'failed' && saveError && (
                  <p className="disclaimer-error" style={{ marginBottom: 8 }}>{saveError}</p>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => saveListing()}
                    disabled={!canSave || saveState === 'saving'}
                    title={!canSave ? 'Add at least one field' : 'Save as draft if incomplete'}
                  >
                    {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved · Save again' : 'Save listing'}
                  </button>
                  {saveState === 'saved' && (
                    <span className="callmodal-hint" style={{ flex: 1 }}>
                      Saved as draft. Activate it from your dashboard once it's complete.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
