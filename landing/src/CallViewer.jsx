import { useEffect, useRef, useState } from 'react'

/**
 * Public viewer at /#call-<32-hex-id>. Polls /api/calls/{id} every 2s for the
 * latest transcript turns. Has an "add context" bar that posts a system
 * message into the live Vapi call so the agent can use it in the next turn.
 */
export default function CallViewer({ callId, onClose }) {
  const [data, setData] = useState({ status: 'loading', turns: [], meta: null })
  const [ctxText, setCtxText] = useState('')
  const [ctxStatus, setCtxStatus] = useState(null)
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const transcriptRef = useRef(null)

  // Poll
  useEffect(() => {
    let stopped = false
    const tick = async () => {
      try {
        const r = await fetch(`/api/calls/${callId}`)
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const j = await r.json()
        if (!stopped) setData({ status: 'ok', ...j })
      } catch (e) {
        if (!stopped) setData((d) => ({ ...d, status: 'error', error: e.message }))
      }
    }
    tick()
    const id = setInterval(tick, 2000)
    return () => { stopped = true; clearInterval(id) }
  }, [callId])

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [data.turns])

  const sendContext = async (text) => {
    const t = (text || '').trim()
    if (!t) return
    setCtxStatus('sending')
    try {
      const r = await fetch(`/api/calls/${callId}/context`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ context: t }),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      setCtxText('')
      setCtxStatus('sent')
      setTimeout(() => setCtxStatus(null), 1500)
    } catch (e) {
      setCtxStatus('failed')
      setTimeout(() => setCtxStatus(null), 2500)
    }
  }

  const toggleMic = () => {
    if (listening) {
      try { recRef.current?.stop() } catch {}
      setListening(false)
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Voice input requires Chrome / Safari / Edge.'); return }
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = false
    let finalText = ''
    rec.onresult = (ev) => {
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript
        if (ev.results[i].isFinal) finalText += t
        else interim += t
      }
      setCtxText((finalText + interim).trim())
    }
    rec.onend = () => {
      setListening(false)
      if (finalText.trim()) sendContext(finalText.trim())
    }
    rec.onerror = () => setListening(false)
    rec.start()
    recRef.current = rec
    setListening(true)
  }

  const meta = data.meta || {}
  const isLive = meta.status === 'in_progress' || meta.status === 'live'

  return (
    <div className="callviewer">
      <header className="callviewer-head">
        <a className="logo" href="/">
          <img src="/logo.svg" alt="" className="logo-mark" width="28" height="28" />
          bnbmesh
        </a>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>← back</button>
      </header>

      <main className="callviewer-main">
        <div className="callviewer-meta">
          <h2>Call <code>{callId.slice(0, 8)}…</code></h2>
          <div className="callviewer-status">
            <span className={`status-dot status-${meta.status || 'loading'}`}></span>
            <span>{meta.status || 'loading'}</span>
            {meta.mode && <span className="callviewer-tag">{meta.mode}</span>}
          </div>
        </div>

        <div className="callviewer-transcript" ref={transcriptRef}>
          {data.status === 'error' && <p className="demo-error">Couldn't load: {data.error}</p>}
          {(data.turns || []).length === 0 && data.status !== 'error' && (
            <p className="callmodal-tip">Waiting for call to start…</p>
          )}
          {(data.turns || []).map((t, i) => (
            <div key={i} className={`turn turn-${t.role}`}>
              <span className="turn-role">{t.role === 'system' ? 'support' : t.role === 'assistant' ? 'agent' : 'guest'}</span>
              <span className="turn-text">{t.text}</span>
            </div>
          ))}
        </div>

        {isLive && (
          <form
            className="callviewer-context"
            onSubmit={(e) => { e.preventDefault(); sendContext(ctxText) }}
          >
            <input
              value={ctxText}
              onChange={(e) => setCtxText(e.target.value)}
              placeholder='Add context for the agent — e.g. "the guest is on a wheelchair, prioritize accessible listings"'
              aria-label="Add context for the agent"
            />
            <button
              type="button"
              onClick={toggleMic}
              className={`hero-mic ${listening ? 'is-listening' : ''}`}
              aria-label="Speak context"
              title={listening ? 'Stop listening' : 'Speak'}
            >
              {listening ? '■' : '🎤'}
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={ctxStatus === 'sending'}>
              {ctxStatus === 'sending' ? '…' : ctxStatus === 'sent' ? 'Sent' : ctxStatus === 'failed' ? 'Retry' : 'Inject'}
            </button>
          </form>
        )}
        {!isLive && meta.status === 'ended' && (
          <p className="callviewer-ended">Call has ended — read-only transcript.</p>
        )}
      </main>
    </div>
  )
}
