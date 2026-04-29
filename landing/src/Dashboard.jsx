import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

/**
 * Host dashboard at /#dashboard. Shows the signed-in user's listings and
 * lets them enable AI Customer Support per listing ($20/mo each) via
 * Stripe Checkout.
 */
export default function Dashboard({ onAddListing }) {
  const { user, loading, getIdToken, signOut } = useAuth()
  const [listings, setListings] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (loading) return
    if (!user) return
    let stopped = false
    ;(async () => {
      try {
        const token = await getIdToken()
        const r = await fetch('/api/me/listings', { headers: { authorization: `Bearer ${token}` } })
        const j = await r.json()
        if (!stopped) setListings(j.listings || [])
      } catch (e) {
        if (!stopped) setError(e.message)
      }
    })()
    return () => { stopped = true }
  }, [user, loading, getIdToken])

  const enableSupport = async (listingId) => {
    setBusyId(listingId); setError(null)
    try {
      const token = await getIdToken()
      const r = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ listing_id: listingId }),
      })
      const j = await r.json()
      if (j.url) window.location.href = j.url
      else setError(j.error || 'Could not start checkout.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const setActive = async (listingId, action) => {
    setBusyId(listingId); setError(null)
    try {
      const token = await getIdToken()
      const r = await fetch(`/api/me/listings/${listingId}/${action}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); return }
      // Update local state so the UI reflects immediately
      setListings((prev) => (prev || []).map((l) => l.id === listingId ? j.listing : l))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const missingFields = (l) => {
    const m = []
    if (!l.address) m.push('address')
    else if (!/,\s*[A-Za-z]{2,}/.test(l.address)) m.push('city/state in address')
    if (!l.nightlyPrice) m.push('nightly price')
    return m
  }

  if (loading) {
    return <div className="admin-shell"><p className="callmodal-tip">Loading…</p></div>
  }

  if (!user) {
    return (
      <div className="admin-shell">
        <h2>Host dashboard</h2>
        <p className="callmodal-tip">Sign in to see your listings.</p>
        <a href="/" className="btn btn-ghost btn-sm">← back</a>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <header className="admin-head">
        <h2>Your listings</h2>
        <div className="admin-head-right">
          <span className="admin-who">{user.email || user.phoneNumber}</span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>sign out</button>
          <a className="btn btn-ghost btn-sm" href="/">← site</a>
        </div>
      </header>

      {error && <p className="demo-error">{error}</p>}

      <section className="admin-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Listings {listings && <span className="admin-count">({listings.length})</span>}</h3>
          <button className="btn btn-primary btn-sm" onClick={onAddListing}>+ Add a listing (voice)</button>
        </div>
        {listings === null ? (
          <p className="callmodal-tip">Loading…</p>
        ) : listings.length === 0 ? (
          <p className="callmodal-tip">
            No listings yet. Click <strong>Add a listing (voice)</strong> and our agent will walk you through adding one in a couple of minutes.
          </p>
        ) : (
          <div className="listings-grid">
            {listings.map((l) => {
              const supportOn = !!l.customer_support_enabled
              const status = l.status || 'draft'
              const isActive = status === 'active'
              const missing = missingFields(l)
              const canActivate = missing.length === 0
              return (
                <article key={l.id} className="listing-card">
                  <div className="listing-card-head">
                    <h4>{l.title || l.address || 'Untitled draft'}</h4>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {isActive && <span className="demo-badge demo-badge-direct">active</span>}
                      {!isActive && status === 'inactive' && <span className="demo-badge">inactive</span>}
                      {!isActive && status !== 'inactive' && <span className="demo-badge demo-badge-mock">draft</span>}
                      {supportOn && <span className="demo-badge demo-badge-direct">support on</span>}
                    </div>
                  </div>
                  <p className="listing-card-meta">
                    {l.address ? <span>{l.address}</span> : <span style={{ fontStyle: 'italic' }}>no address yet</span>}
                    {l.bedrooms ? <span> · {l.bedrooms} bd</span> : null}
                    {l.bathrooms ? <span> · {l.bathrooms} ba</span> : null}
                    {l.nightlyPrice ? <span> · ${l.nightlyPrice}/night</span> : null}
                  </p>
                  {missing.length > 0 && (
                    <p className="callmodal-hint" style={{ margin: 0 }}>
                      To go live, add: <strong>{missing.join(', ')}</strong>
                    </p>
                  )}
                  <div className="listing-card-actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label
                      className={`toggle ${isActive ? 'toggle-on' : ''} ${(!canActivate && !isActive) ? 'toggle-disabled' : ''}`}
                      title={!canActivate && !isActive ? `Cannot activate: ${missing.join(', ')}` : (isActive ? 'Active — guests can find this listing' : 'Inactive')}
                    >
                      <input
                        type="checkbox"
                        checked={isActive}
                        disabled={busyId === l.id || (!isActive && !canActivate)}
                        onChange={() => setActive(l.id, isActive ? 'deactivate' : 'activate')}
                      />
                      <span className="toggle-track"><span className="toggle-thumb"></span></span>
                      <span className="toggle-label">{isActive ? 'Active' : 'Inactive'}</span>
                    </label>

                    {isActive && !supportOn && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => enableSupport(l.id)}
                        disabled={busyId === l.id}
                      >
                        {busyId === l.id ? 'Starting…' : 'Enable AI Customer Support — $20/mo'}
                      </button>
                    )}
                    {isActive && supportOn && (
                      <span className="callmodal-hint">AI customer support is live for this listing.</span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
