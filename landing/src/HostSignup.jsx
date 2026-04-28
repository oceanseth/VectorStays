import { useState } from 'react'
import { useAuth } from './AuthContext'
import SignInModal from './SignInModal'

/**
 * "Get started as a host" — free signup. Once signed in, the visitor lands
 * on /#dashboard where they can add listings and (optionally) enable
 * customer support per listing for $20/mo each.
 */
export default function HostSignup({ onClose }) {
  const { user } = useAuth()
  const [showSignIn, setShowSignIn] = useState(false)

  const proceed = () => {
    if (!user) { setShowSignIn(true); return }
    window.location.hash = '#dashboard'
    onClose?.()
  }

  return (
    <div className="callmodal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="callmodal" style={{ maxWidth: 560 }}>
        <div className="callmodal-head">
          <h3>Host on BnBMesh</h3>
          <button className="callmodal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="callmodal-body">
          <div className="hostsignup-price">
            <span className="hostsignup-amount">Free</span>
            <span className="hostsignup-period">to host</span>
          </div>

          <p className="callmodal-hint" style={{ marginTop: 0, marginBottom: 18 }}>
            Add your listings, sync your reservations, manage everything in one place. No setup fee, no monthly minimum.
          </p>

          <ul className="hostsignup-features">
            <li>
              <strong>Free hosting.</strong> List your places, sync from Guesty/Hospitable/etc., or upload a CSV. We don't take a cut.
            </li>
            <li>
              <strong>Optional add-on: AI Customer Support — <em>$20/month per listing</em>.</strong>
              Your guests call BnBMesh's shared support number; our AI agent identifies them, checks the reservation, and handles the call. You only pay for the listings you turn it on for.
            </li>
            <li>
              <strong>Cancel any time, per listing.</strong> Toggle support on for a busy season, off in the off-season.
            </li>
          </ul>

          {user && (
            <p className="callmodal-hint" style={{ marginTop: 14 }}>
              Signed in as <code>{user.email || user.phoneNumber || user.uid}</code>.
            </p>
          )}

          <div className="callmodal-actions">
            <button className="btn btn-primary callmodal-cta" onClick={proceed}>
              {user ? 'Go to dashboard →' : 'Sign in to get started'}
            </button>
          </div>
        </div>

        {showSignIn && (
          <SignInModal onClose={() => {
            setShowSignIn(false)
            // After sign-in succeeds, AuthContext will rerender with user set;
            // we just close the SignInModal and the user can click "Go to dashboard".
          }} />
        )}
      </div>
    </div>
  )
}
