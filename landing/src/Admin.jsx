import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import UserMenu from './UserMenu'

/**
 * Admin dashboard at /#admin. Server-side admin allowlist enforced too —
 * the Lambda re-checks the verified email against ADMIN_EMAILS env var.
 */
export default function Admin() {
  const { user, isAdmin, getIdToken, signOut } = useAuth()
  const [leads, setLeads] = useState(null)
  const [hosts, setHosts] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let stopped = false
    if (!isAdmin) return
    ;(async () => {
      try {
        const token = await getIdToken()
        const headers = { authorization: `Bearer ${token}` }
        const [l, h] = await Promise.all([
          fetch('/api/admin/leads', { headers }).then((r) => r.json()),
          fetch('/api/admin/hosts', { headers }).then((r) => r.json()),
        ])
        if (stopped) return
        setLeads(l.leads || [])
        setHosts(h.hosts || [])
      } catch (e) {
        if (!stopped) setError(e.message)
      }
    })()
    return () => { stopped = true }
  }, [isAdmin, getIdToken])

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
        <UserMenu user={user} signOut={signOut} />
      </header>

      {error && <p className="demo-error">{error}</p>}

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
