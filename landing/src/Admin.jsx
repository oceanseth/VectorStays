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
  const [editingKey, setEditingKey] = useState(null) // 'hosts' | 'guests' | 'faq' | null
  const [editorDraft, setEditorDraft] = useState('')
  const [kbSaving, setKbSaving] = useState(false)
  const [kbFlash, setKbFlash] = useState(null) // { key, ts }
  const [error, setError] = useState(null)

  const KB_GUIDES = [
    { key: 'hosts',  label: 'Hosts',  hint: 'What the agent says about features for existing hosts (voice support, direct listings, ops agents).' },
    { key: 'guests', label: 'Guests', hint: 'What the agent says to travelers about searching, booking, and getting in-stay help.' },
    { key: 'faq',    label: 'FAQ',    hint: 'Partners, cities/governments, pricing, anything else not covered above.' },
  ]

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

  const openEditor = (key) => {
    setEditingKey(key)
    setEditorDraft((kb && kb[key]) || '')
  }
  const closeEditor = () => {
    setEditingKey(null)
    setEditorDraft('')
  }
  const saveEditor = async () => {
    if (!editingKey) return
    setKbSaving(true)
    try {
      const next = { ...(kb || {}), [editingKey]: editorDraft }
      const token = await getIdToken()
      const r = await fetch('/api/admin/kb', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ kb: next }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setKb(j.kb)
      setKbFlash({ key: editingKey, ts: Date.now() })
      setTimeout(() => setKbFlash(null), 1800)
      closeEditor()
    } catch (e) {
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
        <h3>Voice agent knowledge</h3>
        <p className="callmodal-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          The voice agent calls <code>get_kb(category)</code> to answer feature,
          pricing, partner, and city questions. Click a guide to edit what the
          agent will read out.
        </p>
        {kb === null ? (
          <p className="callmodal-tip">Loading…</p>
        ) : (
          <ul className="kb-list">
            {KB_GUIDES.map(({ key, label, hint }) => {
              const content = (kb[key] || '').trim()
              const preview = content ? (content.length > 180 ? content.slice(0, 180).trim() + '…' : content) : '— empty —'
              const flashed = kbFlash?.key === key
              return (
                <li key={key}>
                  <button
                    className={`kb-card ${flashed ? 'is-fresh' : ''}`}
                    onClick={() => openEditor(key)}
                  >
                    <div className="kb-card-head">
                      <strong>{label}</strong>
                      <span className="kb-card-len">{content.length} chars</span>
                    </div>
                    <p className="kb-card-hint">{hint}</p>
                    <p className="kb-card-preview">{preview}</p>
                    {flashed && <span className="kb-card-flash">✓ saved</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {kb?.updated_at && (
          <p className="kb-meta" style={{ marginTop: 12 }}>
            Last edit {new Date(kb.updated_at).toLocaleString()} by {kb.updated_by || '—'}
          </p>
        )}
      </section>

      {editingKey && (
        <div className="callmodal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeEditor() }}>
          <div className="callmodal" style={{ maxWidth: 720 }}>
            <div className="callmodal-head">
              <h3>Edit “{KB_GUIDES.find((g) => g.key === editingKey)?.label}” guide</h3>
              <button className="callmodal-close" onClick={closeEditor} aria-label="Close">×</button>
            </div>
            <div className="callmodal-body">
              <p className="callmodal-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                {KB_GUIDES.find((g) => g.key === editingKey)?.hint}
              </p>
              <textarea
                className="kb-modal-textarea"
                value={editorDraft}
                onChange={(e) => setEditorDraft(e.target.value)}
                rows={14}
                autoFocus
              />
              <p className="kb-meta" style={{ marginTop: 6 }}>
                {editorDraft.length} / 8000 chars
              </p>
              {error && <p className="disclaimer-error">{error}</p>}
              <div className="callmodal-actions">
                <button className="btn btn-ghost btn-sm" onClick={closeEditor} disabled={kbSaving}>Cancel</button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={saveEditor}
                  disabled={kbSaving || editorDraft === (kb?.[editingKey] || '')}
                >
                  {kbSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
