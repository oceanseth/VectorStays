import { useEffect, useRef, useState } from 'react'
import Vapi from '@vapi-ai/web'

const VAPI_PUBLIC_KEY = '5c140bc1-303b-495f-88c0-ee5e87baefac'

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

/**
 * Browser-side voice call via the Vapi Web SDK.
 *
 * Mode "support" → BnBMesh travel-support assistant.
 * Mode "host"    → host onboarding assistant that walks the user through
 *                  creating a listing.
 *
 * On call start we mint a 32-char id, register it with our backend, and stream
 * transcript turns to /api/calls/{id}/turn so the viewer at /#call-{id} shows
 * the same transcript live.
 */
export default function Call({ mode = 'support', onClose }) {
  const [status, setStatus] = useState('idle') // idle | connecting | live | ended | error
  const [transcript, setTranscript] = useState([])
  const [callId] = useState(makeCallId)
  const [shareCopied, setShareCopied] = useState(false)
  const [error, setError] = useState(null)
  const vapiRef = useRef(null)
  const transcriptRef = useRef(null)

  const shareUrl = `${window.location.origin}/#call-${callId}`

  useEffect(() => {
    const vapi = new Vapi(VAPI_PUBLIC_KEY)
    vapiRef.current = vapi

    vapi.on('call-start', () => {
      setStatus('live')
      fetch(`/api/calls/${callId}/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, started_at: new Date().toISOString() }),
      }).catch(() => {})
    })

    vapi.on('call-end', () => {
      setStatus('ended')
      fetch(`/api/calls/${callId}/end`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ended_at: new Date().toISOString() }),
      }).catch(() => {})
    })

    vapi.on('error', (e) => {
      console.error('vapi err', e)
      setError(e?.error?.message || e?.message || 'unknown error')
      setStatus('error')
    })

    vapi.on('message', (msg) => {
      if (msg.type !== 'transcript') return
      if (msg.transcriptType !== 'final') return
      const turn = {
        role: msg.role,                          // 'user' or 'assistant'
        text: msg.transcript,
        at: new Date().toISOString(),
      }
      setTranscript((t) => [...t, turn])
      fetch(`/api/calls/${callId}/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(turn),
      }).catch(() => {})
    })

    return () => { try { vapi.stop() } catch {} }
  }, [callId, mode])

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [transcript])

  const start = async () => {
    setStatus('connecting')
    setError(null)
    try {
      await vapiRef.current.start(ASSISTANTS[mode])
    } catch (e) {
      setError(e?.message || 'could not start call')
      setStatus('error')
    }
  }

  const stop = () => { try { vapiRef.current?.stop() } catch {} }

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 1800)
    } catch {}
  }

  return (
    <div className="callmodal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="callmodal">
        <div className="callmodal-head">
          <h3>{mode === 'host' ? 'Become a Host' : 'BnBMesh Voice Support'}</h3>
          <button className="callmodal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="callmodal-body">
          {status === 'idle' && (
            <div className="callmodal-intro">
              <p>
                {mode === 'host'
                  ? 'Talk to our onboarding agent and we will collect everything we need to list your place — address, beds, price, amenities. Takes about three minutes.'
                  : 'Talk to a BnBMesh agent about finding a stay, splitting a trip across listings, or anything about your reservation.'}
              </p>
              <button className="btn btn-primary callmodal-cta" onClick={start}>
                {mode === 'host' ? 'Start onboarding call' : 'Start call'}
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

              <div className="callmodal-actions">
                {status === 'live' && (
                  <button className="btn btn-danger" onClick={stop}>End call</button>
                )}
                {status === 'ended' && (
                  <button className="btn btn-primary" onClick={onClose}>Done</button>
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
      </div>
    </div>
  )
}
