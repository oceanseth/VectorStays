import { useEffect, useRef, useState } from 'react'
import Call from './Call'
import CallViewer from './CallViewer'
import Disclaimer from './Disclaimer'
import './App.css'

const MCP_URL = 'https://bnbmesh.ai/api/mcp'

const FEATURES = [
  {
    tag: 'Agentic Hosts',
    title: 'Let an AI run the listing.',
    body:
      'Guest messaging, voice calls, pricing, cleaning hand-offs — all orchestrated by agents that know your reservations and listings. A co-host that never sleeps.',
  },
  {
    tag: 'Meta-search',
    title: 'One search. Every platform.',
    body:
      'Compare the same property across Airbnb, VRBO, HomeAway, and direct-booked sites. See where each stay is cheapest and where it has availability for your dates.',
  },
  {
    tag: 'Split-Stay Booking',
    title: "No single booking? We stitch multiple.",
    body:
      "When no single listing covers your whole trip, BnBMesh finds compatible stays in the same neighborhood and books them as one itinerary.",
  },
  {
    tag: 'ChatGPT Skill',
    title: 'Install in ChatGPT. Search by chat.',
    body:
      'BnBMesh ships as a Model Context Protocol server. Add it as a connector in ChatGPT and ask "find me a 3-bedroom in Santa Barbara for Memorial Day weekend" — it returns live listings from every platform.',
  },
  {
    tag: 'Live Index',
    title: 'Redis-backed, always fresh.',
    body:
      'Listing data, availability, and agent memory cached in Redis so the next search (and the next agent turn) stays fast without hammering origin APIs.',
  },
]

function Nav({ onTalk, onHost }) {
  return (
    <nav className="nav">
      <a className="logo" href="/">
        <img src="/logo.svg" alt="" className="logo-mark" width="28" height="28" />
        bnbmesh
      </a>
      <div className="nav-links">
        <a href="#features">Features</a>
        <a href="#mcp">ChatGPT Skill</a>
        <button className="btn btn-ghost" onClick={onTalk}>Talk to support</button>
      </div>
    </nav>
  )
}

/**
 * Hero + inline meta-search. Live results via /api/search (TinyFish-backed
 * when TINYFISH_API_KEY is set on the Lambda, deterministic mock otherwise).
 *
 * Mic button uses the Web Speech API (browser-native). No vendor SDK required.
 * When the user stops speaking we drop the transcript into the input and fire
 * the search automatically.
 */
function sourceLabel(source, directCount) {
  if (!source) return ''
  const map = {
    'live':              'live TinyFish scrape',
    'live-cached':       'live TinyFish (Redis-cached)',
    'live+direct':       `live scrape · ${directCount} direct`,
    'live-cached+direct':`Redis-cached · ${directCount} direct`,
    'demo':              'demo placeholders (Airbnb scrape unavailable)',
    'demo+direct':       `demo placeholders · ${directCount} direct`,
  }
  return map[source] || source
}

function Hero({ onTalk, onHost }) {
  const [q, setQ] = useState('3 bedroom in Santa Barbara Memorial Day weekend')
  const [state, setState] = useState({ loading: false, results: null, error: null, source: null })
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)

  const runSearch = async (query) => {
    const effective = (query ?? q).trim()
    if (!effective) return
    setState({ loading: true, results: null, error: null, source: null })
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(effective)}`)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const j = await r.json()
      setState({ loading: false, results: j.results || [], error: null, source: j.source, directCount: j.direct_count || 0 })
    } catch (err) {
      setState({ loading: false, results: null, error: err.message, source: null })
    }
  }

  const toggleMic = () => {
    if (listening) {
      try { recognitionRef.current?.stop() } catch {}
      setListening(false)
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      alert('Voice input needs Chrome / Safari / Edge. Try typing instead.')
      return
    }
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
      setQ((finalText + interim).trim())
    }
    rec.onend = () => {
      setListening(false)
      if (finalText.trim()) runSearch(finalText.trim())
    }
    rec.onerror = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  useEffect(() => () => { try { recognitionRef.current?.stop() } catch {} }, [])

  const onSubmit = (e) => { e.preventDefault(); runSearch() }

  return (
    <section className="hero">
      <div className="hero-inner">
        <p className="hero-kicker">Democratizing short-term rental.</p>
        <h1>
          Agentic hosts.<br />
          Meta-search for stays.<br />
          <span className="hero-accent">Book across every platform.</span>
        </h1>
        <p className="hero-sub">
          BnBMesh searches Airbnb, VRBO, HomeAway and direct-booked sites in one shot.
          Type what you want, or tap the mic and say it out loud.
        </p>

        <form onSubmit={onSubmit} className="hero-search" role="search">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='e.g. "2br in Austin April 20-25, walking distance to 6th St"'
            aria-label="Search listings"
          />
          <button
            type="button"
            onClick={toggleMic}
            className={`hero-mic ${listening ? 'is-listening' : ''}`}
            aria-label="Voice search"
            title={listening ? 'Stop listening' : 'Search by voice'}
          >
            {listening ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            )}
          </button>
          <button type="submit" className="btn btn-primary" disabled={state.loading}>
            {state.loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        <p className="hero-alt">
          Or just tell ChatGPT to <a href="#mcp">install the BnBMesh skill</a> and
          talk to it.
        </p>

        {state.error && <p className="demo-error">Offline: {state.error}</p>}
        {state.source && state.results?.length === 0 && (
          <p className="demo-meta">No results ({state.source}). Try a different query.</p>
        )}
        {state.results && state.results.length > 0 && (
          <div className="hero-results-wrap">
            <p className="demo-meta">
              {state.results.length} listings — {sourceLabel(state.source, state.directCount)}
            </p>
            <ul className="demo-results">
              {state.results.slice(0, 8).map((r) => (
                <li key={r.id} className={r.isDirect ? 'demo-result-direct' : (r.isDemo ? 'demo-result-mock' : '')}>
                  <div className="demo-result-title">
                    {r.title}
                    {r.isDirect && <span className="demo-badge demo-badge-direct">direct</span>}
                    {r.isDemo && <span className="demo-badge demo-badge-mock">demo</span>}
                  </div>
                  <div className="demo-result-sub">
                    {r.location}
                    {r.nightlyPrice ? ` · $${r.nightlyPrice}/night` : ''}
                    {r.cheapestPlatform ? <> · cheapest on <strong>{r.cheapestPlatform}</strong></> : null}
                  </div>
                  {r.platforms && Object.keys(r.platforms).length > 0 && (
                    <div className="demo-result-platforms">
                      {Object.entries(r.platforms).map(([p, price]) => (
                        <span key={p}>{p}: ${price}</span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="cta-row">
          <button className="btn btn-primary" onClick={onHost}>Become a Host →</button>
          <button className="btn btn-ghost" onClick={onTalk}>Talk to support</button>
          <a className="btn btn-ghost" href="#mcp">Install in ChatGPT</a>
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="features">
      <div className="section-label">What BnBMesh does</div>
      <div className="feature-grid">
        {FEATURES.map((f) => (
          <article key={f.tag} className="feature-card">
            <div className="feature-tag">{f.tag}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function McpSection() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(MCP_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }
  return (
    <section id="mcp" className="mcp">
      <div className="section-label">For power users</div>
      <h2>Add BnBMesh as a ChatGPT connector.</h2>
      <p className="mcp-body">
        BnBMesh exposes a Model Context Protocol server. Open ChatGPT → Settings →
        Connectors → Add custom MCP server, then paste this URL:
      </p>
      <div className="mcp-url">
        <code>{MCP_URL}</code>
        <button className="btn btn-primary btn-sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mcp-footnote">
        Works with any MCP-aware agent (Claude, ChatGPT, Cursor). Tools exposed:
        {' '}<code>search_listings</code>, <code>compare_platforms</code>,{' '}
        <code>plan_split_stay</code>, <code>remember_preference</code>,{' '}
        <code>recall_preferences</code>.
      </p>
    </section>
  )
}

function Footer() {
  return (
    <footer className="foot">
      <span>© 2026 BnBMesh</span>
      <span className="foot-built">
        Powered by TinyFish · Upstash Redis · shipables.dev · x402 · bland.ai · AWS Lambda
      </span>
    </footer>
  )
}

export default function App() {
  const [callMode, setCallMode] = useState(null) // null | 'support' | 'host'
  const [viewCallId, setViewCallId] = useState(null)

  // Hash routing: #call-<id> → public viewer.
  useEffect(() => {
    const sync = () => {
      const m = (window.location.hash || '').match(/^#call-([a-f0-9]{32})$/)
      setViewCallId(m ? m[1] : null)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  if (viewCallId) {
    return <CallViewer callId={viewCallId} onClose={() => { window.location.hash = '' }} />
  }

  return (
    <>
      <Nav onTalk={() => setCallMode('support')} onHost={() => setCallMode('host')} />
      <Hero onTalk={() => setCallMode('support')} onHost={() => setCallMode('host')} />
      <Features />
      <McpSection />
      <Footer />
      {callMode && <Call mode={callMode} onClose={() => setCallMode(null)} />}
      <Disclaimer />
    </>
  )
}
