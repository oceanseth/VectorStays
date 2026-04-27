import { useEffect, useRef, useState } from 'react'
import {
  auth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
  signInWithPhoneNumber,
  linkWithPopup,
  linkWithCredential,
  PhoneAuthProvider,
} from './firebase'
import { useAuth } from './AuthContext'

/**
 * Sign-in modal supporting two providers:
 *   - Google (popup)
 *   - Phone (SMS code)
 *
 * If the user is already signed in (e.g. with Google) and chooses the OTHER
 * provider, we LINK it onto the same UID instead of creating a new account.
 * This is what lets a host's phone and email coexist on one Firebase user.
 */
export default function SignInModal({ onClose, mode = 'sign-in' }) {
  const { user } = useAuth()
  const [step, setStep] = useState('choose') // choose | phone-input | phone-code | linking
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const recaptchaRef = useRef(null)
  const recaptchaContainerId = 'recaptcha-container'

  useEffect(() => {
    return () => { try { recaptchaRef.current?.clear?.() } catch {} }
  }, [])

  const ensureRecaptcha = () => {
    if (recaptchaRef.current) return recaptchaRef.current
    const v = new RecaptchaVerifier(auth, recaptchaContainerId, { size: 'invisible' })
    recaptchaRef.current = v
    return v
  }

  const startGoogle = async () => {
    setBusy(true); setError(null)
    try {
      const provider = new GoogleAuthProvider()
      if (user && mode === 'link') {
        await linkWithPopup(user, provider)
      } else {
        await signInWithPopup(auth, provider)
      }
      onClose?.()
    } catch (e) {
      setError(humanizeAuthError(e))
    } finally {
      setBusy(false)
    }
  }

  const startPhone = async () => {
    setBusy(true); setError(null)
    try {
      const e164 = toE164(phone)
      if (!e164) { setError('Enter a valid 10-digit phone number'); setBusy(false); return }
      const verifier = ensureRecaptcha()
      // If signed in, the phone provider needs verifyPhoneNumber → linkWithCredential
      // If not signed in, signInWithPhoneNumber creates a fresh user
      if (user) {
        const provider = new PhoneAuthProvider(auth)
        const verificationId = await provider.verifyPhoneNumber(e164, verifier)
        setConfirmation({ kind: 'link', verificationId })
      } else {
        const conf = await signInWithPhoneNumber(auth, e164, verifier)
        setConfirmation({ kind: 'sign-in', confirmationResult: conf })
      }
      setStep('phone-code')
    } catch (e) {
      setError(humanizeAuthError(e))
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async () => {
    setBusy(true); setError(null)
    try {
      if (confirmation.kind === 'sign-in') {
        await confirmation.confirmationResult.confirm(code)
      } else {
        const cred = PhoneAuthProvider.credential(confirmation.verificationId, code)
        await linkWithCredential(user, cred)
      }
      onClose?.()
    } catch (e) {
      setError(humanizeAuthError(e))
    } finally {
      setBusy(false)
    }
  }

  const closeOnBackdrop = (e) => { if (e.target === e.currentTarget) onClose?.() }

  return (
    <div className="callmodal-backdrop" onClick={closeOnBackdrop}>
      <div className="callmodal" style={{ maxWidth: 440 }}>
        <div className="callmodal-head">
          <h3>{mode === 'link' ? 'Link a phone number' : 'Sign in to BnBMesh'}</h3>
          <button className="callmodal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="callmodal-body">
          {step === 'choose' && (
            <div className="signin-choose">
              {!user && (
                <button className="btn signin-google" onClick={startGoogle} disabled={busy}>
                  <span className="signin-google-mark">G</span>
                  Continue with Google
                </button>
              )}
              {user && mode === 'link' && !user.providerData.some((p) => p.providerId === 'google.com') && (
                <button className="btn signin-google" onClick={startGoogle} disabled={busy}>
                  <span className="signin-google-mark">G</span>
                  Link Google account
                </button>
              )}
              <div className="signin-or">or</div>
              <button className="btn btn-ghost signin-phone-btn" onClick={() => setStep('phone-input')}>
                {user ? 'Add phone number' : 'Continue with phone'}
              </button>
            </div>
          )}

          {step === 'phone-input' && (
            <form onSubmit={(e) => { e.preventDefault(); startPhone() }} className="signin-form">
              <label>
                <span>Mobile number</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(805) 555-1234"
                  autoFocus
                />
              </label>
              <p className="callmodal-hint">We'll text you a one-time code. US numbers only for now.</p>
              <div id={recaptchaContainerId}></div>
              <div className="callmodal-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('choose')}>← back</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                  {busy ? 'Sending…' : 'Send code'}
                </button>
              </div>
            </form>
          )}

          {step === 'phone-code' && (
            <form onSubmit={(e) => { e.preventDefault(); submitCode() }} className="signin-form">
              <label>
                <span>Verification code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  autoFocus
                />
              </label>
              <p className="callmodal-hint">Check your texts.</p>
              <div className="callmodal-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('phone-input')}>← back</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy || code.length < 6}>
                  {busy ? 'Verifying…' : (confirmation?.kind === 'link' ? 'Link phone' : 'Sign in')}
                </button>
              </div>
            </form>
          )}

          {error && <p className="disclaimer-error" style={{ marginTop: 12 }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}

function toE164(input) {
  const digits = (input || '').replace(/\D+/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return null
}

function humanizeAuthError(e) {
  const code = e?.code || ''
  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account with this email already exists. Sign in with that method first, then link this one from your profile.'
  }
  if (code === 'auth/credential-already-in-use') {
    return 'This phone is already attached to a different account.'
  }
  if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
    return 'Sign-in popup was blocked or closed. Try again.'
  }
  if (code === 'auth/invalid-verification-code') {
    return 'That code didn\'t match. Try again.'
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts — wait a minute and try again.'
  }
  return e?.message || 'Sign-in failed.'
}
