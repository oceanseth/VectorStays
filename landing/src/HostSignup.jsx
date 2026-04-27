import { useState } from 'react'
import { useAuth } from './AuthContext'
import SignInModal from './SignInModal'

/**
 * "Sign up your Airbnb" pricing pitch + Stripe checkout.
 *
 * Pricing model: $20/month for AI guest support — hosts integrate their
 * listings/reservations, guests call the SHARED BnBMesh support number, and
 * the agent matches the caller's number to a reservation to know which host
 * + listing they belong to. Hosts get SMS'd when a human is needed.
 */
export default function HostSignup({ onClose }) {
  const { user, getIdToken } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [showSignIn, setShowSignIn] = useState(false)

  const startCheckout = async () => {
    if (!user) { setShowSignIn(true); return }
    setBusy(true); setError(null)
    try {
      const token = await getIdToken()
      const r = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: 'host_monthly_20' }),
      })
      const j = await r.json()
      if (j.url) {
        window.location.href = j.url
      } else if (j.error) {
        setError(j.error)
      } else {
        setError('Could not start checkout — Stripe may not be configured yet.')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="callmodal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="callmodal" style={{ maxWidth: 560 }}>
        <div className="callmodal-head">
          <h3>Connect your Airbnb to BnBMesh</h3>
          <button className="callmodal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="callmodal-body">
          <div className="hostsignup-price">
            <span className="hostsignup-amount">$20</span>
            <span className="hostsignup-period">/ month</span>
          </div>

          <ul className="hostsignup-features">
            <li>
              <strong>Shared support line.</strong> Your guests call BnBMesh's
              number; our AI agent identifies them by phone, looks up which
              listing + reservation they're on, and handles the conversation.
            </li>
            <li>
              <strong>SMS notifications.</strong> If the caller asks for
              something the agent can't resolve, you get a text with a link
              to join the live call from anywhere.
            </li>
            <li>
              <strong>Reservation sync.</strong> Connect Guesty, Hospitable,
              OwnerRez, or upload a CSV. We match incoming caller phone
              numbers against your guest records.
            </li>
            <li>
              <strong>Cancel anytime.</strong> No setup fee, no contract.
            </li>
          </ul>

          <p className="callmodal-hint" style={{ marginTop: 16 }}>
            Cards processed by Stripe. We never see card details.
          </p>

          {error && <p className="disclaimer-error">{error}</p>}

          <div className="callmodal-actions">
            <button className="btn btn-primary callmodal-cta" onClick={startCheckout} disabled={busy}>
              {busy ? 'Starting…' : (user ? 'Subscribe — $20/month' : 'Sign in to subscribe')}
            </button>
          </div>

          {user && (
            <p className="callmodal-hint" style={{ marginTop: 10 }}>
              Signed in as <code>{user.email || user.phoneNumber || user.uid}</code>.
            </p>
          )}
        </div>

        {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
      </div>
    </div>
  )
}
