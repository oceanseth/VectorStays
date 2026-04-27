import { useEffect, useState } from 'react'

const KEY = 'bnbmesh:dismissed-disclaimer'

/**
 * First-run popup. Tells the visitor we're a work in progress and asks for an
 * email — either "notify me when ready" or "investor / partner interest".
 * Dismissal is sticky in localStorage so they don't see it on every visit.
 */
export default function Disclaimer() {
  const [show, setShow] = useState(false)
  const [email, setEmail] = useState('')
  const [intent, setIntent] = useState('notify')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true)
    } catch {
      setShow(true)
    }
  }, [])

  const dismiss = (reason = 'dismissed') => {
    try { localStorage.setItem(KEY, JSON.stringify({ at: new Date().toISOString(), reason })) } catch {}
    setShow(false)
  }

  const submit = async (e) => {
    e?.preventDefault?.()
    setError(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email.')
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, intent, source: 'disclaimer' }),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      setDone(true)
      setTimeout(() => dismiss('submitted'), 1200)
    } catch (e2) {
      setError('Could not save your email — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!show) return null

  return (
    <div className="disclaimer-backdrop">
      <div className="disclaimer-card" role="dialog" aria-labelledby="disclaimer-title">
        <div className="disclaimer-head">
          <img src="/logo.svg" alt="" width="28" height="28" />
          <h3 id="disclaimer-title">BnBMesh is a work in progress</h3>
        </div>

        <p className="disclaimer-body">
          You're early. The platform is functional but not feature-complete and
          does not yet have real listing inventory. Most search results today
          are demo placeholders, clearly labeled.
        </p>
        <p className="disclaimer-body">
          Leave your email and we'll let you know when it's ready, or get in
          touch about an investor / partner conversation.
        </p>

        {done ? (
          <p className="disclaimer-thanks">Thanks — you're on the list.</p>
        ) : (
          <form onSubmit={submit} className="disclaimer-form">
            <label className="disclaimer-label">
              <span>Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </label>
            <fieldset className="disclaimer-intent">
              <legend>I'm interested as</legend>
              <label>
                <input type="radio" name="intent" value="notify" checked={intent === 'notify'} onChange={(e) => setIntent(e.target.value)} />
                <span>a future user — notify me</span>
              </label>
              <label>
                <input type="radio" name="intent" value="investor" checked={intent === 'investor'} onChange={(e) => setIntent(e.target.value)} />
                <span>an investor</span>
              </label>
              <label>
                <input type="radio" name="intent" value="partner" checked={intent === 'partner'} onChange={(e) => setIntent(e.target.value)} />
                <span>a partner / vendor</span>
              </label>
            </fieldset>
            {error && <p className="disclaimer-error">{error}</p>}
            <div className="disclaimer-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismiss('skipped')}>
                Skip — just let me poke around
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                {submitting ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
