import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

/**
 * Admin dashboard at /#admin. Server-side admin allowlist enforced too —
 * the Lambda re-checks the verified email against ADMIN_EMAILS env var.
 */
export default function Admin() {
  const { user, isAdmin, getIdToken, signOut } = useAuth()
  const [leads, setLeads] = useState(null)
  const [hosts, setHosts] = useState(null)
  const [kb, setKb] = useState(null)
  const [kbDirty, setKbDirty] = useState(false)
  const [kbSaving, setKbSaving] = useState(false)
  const [kbStatus, setKbStatus] = useState(null) // null | 'saved' | 'failed'
  const [error, setError] = useState(null)

  useEffect(() => {
    let stopped = false
    if (!isAdmin) return
    ;(async () => {
      try {
        const token = await getIdToken()
        const headers = { authorization: `Bearer ${token}` }
        const [l, h, k] = await Promise.all([
          fetch('/api/admin/leads', { headers }).then((r) => r.json()),
          fetch('/api/admin/hosts', { headers }).then((r) => r.json()),
          fetch('/api/admin/kb',    { headers }).then((r) => r.json()),
        ])
        if (stopped) return
        setLeads(l.leads || [])
        setHosts(h.hosts || [])
        setKb(k.kb || { hosts: '', guests: '', faq: '' })
      } catch (e) {
        if (!stopped) setError(e.message)
      }
    })()
    return () => { stopped = true }
  }, [isAdmin, getIdToken])

  const updateKb = (key, value) => {
    setKb((prev) => ({ ...(prev || {}), [key]: value }))
    setKbDirty(true)
    setKbStatus(null)
  }

  const saveKb = async () => {
    setKbSaving(true); setKbStatus(null)
    try {
      const token = await getIdToken()
      const r = await fetch('/api/admin/kb', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ kb }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setKb(j.kb)
      setKbDirty(false)
      setKbStatus('saved')
      setTimeout(() => setKbStatus(null), 1800)
    } catch (e) {
      setKbStatus('failed')
      setError(e.message)
    } finally {
      setKbSaving(false)
    }
  }

  if (!user) {
    return (
      <div className="admin-shell">
        <h2>Admin</h2>
        <p className="callmodal-tip">You're not signed in.</p>
        <a href="/" className="btn btn-ghost btn-sm">← back</a>
      </div>
    )
  }
  if (!isAdmin) {
    return (
      <div className="admin-shell">
        <h2>Admin</h2>
        <p className="demo-error">Signed in as {user.email || user.uid} — not authorized.</p>
        <button className="btn btn-ghost btn-sm" onClick={signOut}>sign out</button>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <header className="admin-head">
        <h2>BnBMesh admin</h2>
      </header>

      {error && <p className="demo-error">{error}</p>}

      <section className="admin-section">
        <h3>Knowledge base</h3>
        <p className="callmodal-hint" style={{ marginTop: 0 }}>
          The voice agent calls <code>get_kb(category)</code> to answer
          feature / pricing / partner / city questions. Edit the canonical
          answer for each category below.
        </p>
        {kb === null ? (
          <p className="callmodal-tip">Loading…</p>
        ) : (
          <div className="kb-editor">
            {[
              { key: 'hosts',  label: 'Hosts',  hint: 'customer support voice agents, direct listings, operations agents' },
              { key: 'guests', label: 'Guests', hint: 'booking, finding reservations, in-stay support' },
              { key: 'faq',    label: 'FAQ',    hint: 'partners, city / government access, anything else' },
            ].map(({ key, label, hint }) => (
              <div key={key} className="kb-field">
                <label htmlFor={`kb-${key}`}>
                  <strong>{label}</strong> <span className="kb-hint">{hint}</span>
                </label>
                <textarea
                  id={`kb-${key}`}
                  value={kb[key] || ''}
                  onChange={(e) => updateKb(key, e.target.value)}
                  rows={6}
                />
              </div>
            ))}
            <div className="kb-actions">
              {kb?.updated_at && (
                <span className="kb-meta">
                  Last edit {new Date(kb.updated_at).toLocaleString()} by {kb.updated_by || '—'}
                </span>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={saveKb}
                disabled={!kbDirty || kbSaving}
              >
                {kbSaving ? 'Saving…' : kbStatus === 'saved' ? '✓ Saved' : 'Save knowledge base'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="admin-section">
        <h3>Leads {leads && <span className="admin-count">({leads.length})</span>}</h3>
        {leads === null ? <p className="callmodal-tip">Loading…</p> :
         leads.length === 0 ? <p className="callmodal-tip">No leads yet.</p> :
         (
          <table className="admin-table">
            <thead><tr><th>Captured</th><th>Email</th><th>Intent</th><th>Source</th></tr></thead>
            <tbody>
              {leads.map((l, i) => (
                <tr key={i}>
                  <td>{(l.captured_at || '').replace('T', ' ').slice(0, 19)}</td>
                  <td><a href={`mailto:${l.email}`}>{l.email}</a></td>
                  <td>{l.intent}</td>
                  <td>{l.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
         )}
      </section>

      <section className="admin-section">
        <h3>Paying hosts {hosts && <span className="admin-count">({hosts.length})</span>}</h3>
        {hosts === null ? <p className="callmodal-tip">Loading…</p> :
         hosts.length === 0 ? <p className="callmodal-tip">No subscribed hosts yet.</p> :
         (
          <table className="admin-table">
            <thead><tr><th>Joined</th><th>Email</th><th>Phone</th><th>Status</th><th>Stripe sub</th></tr></thead>
            <tbody>
              {hosts.map((h) => (
                <tr key={h.uid}>
                  <td>{(h.created_at || '').slice(0, 10)}</td>
                  <td>{h.email || '—'}</td>
                  <td>{h.phone || '—'}</td>
                  <td>{h.status || '—'}</td>
                  <td>{h.stripe_subscription_id ? <code>{h.stripe_subscription_id.slice(0, 14)}…</code> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
         )}
      </section>
    </div>
  )
}
