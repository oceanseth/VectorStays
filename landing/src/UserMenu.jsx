import { useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'

/**
 * Compact user-account button. Shows the user's email/phone as an unobtrusive
 * top-right pill on dashboards. Clicking opens a small menu with navigation
 * links + "Sign out". Closes on outside click/touch.
 */
export default function UserMenu({ user, signOut }) {
  const { isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [open])

  const close = () => setOpen(false)
  const label = user.email || user.phoneNumber || 'Account'
  return (
    <div className="user-menu" ref={ref}>
      <button
        className="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="user-menu-label">{label}</span>
        <span className="user-menu-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu">
          <a href="/" role="menuitem" onClick={close}>← Back to site</a>
          <a href="#dashboard" role="menuitem" onClick={close}>My listings</a>
          {isAdmin && <a href="#admin" role="menuitem" onClick={close}>Admin</a>}
          <button role="menuitem" onClick={() => { close(); signOut() }}>Sign out</button>
        </div>
      )}
    </div>
  )
}
