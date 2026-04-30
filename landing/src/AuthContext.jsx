import { createContext, useContext, useEffect, useState } from 'react'
import { auth, onAuthStateChanged, signOut as fbSignOut } from './firebase'

const ADMIN_EMAILS = new Set([
  'seth@voicecert.com',
  'seth@snapchallenge.com',
  'seth@snapchallenge.net',
])

const AuthCtx = createContext({
  user: null,
  loading: true,
  isAdmin: false,
  signOut: () => {},
  getIdToken: async () => null,
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
      // Register the user with our backend so the phone-to-uid index
      // is up to date (used by the voice agent's
      // lookup_caller_reservations tool to match incoming callers).
      // Fire-and-forget; errors are non-fatal.
      if (u) {
        u.getIdToken().then((token) => {
          fetch('/api/me', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({}),
          }).catch(() => {})
        }).catch(() => {})
      }
    })
  }, [])

  const value = {
    user,
    loading,
    isAdmin: !!(user && user.email && ADMIN_EMAILS.has(user.email.toLowerCase())),
    // Sign out everywhere drops the user back on the public homepage so they
    // don't land on an empty admin/dashboard view that immediately redirects.
    signOut: async () => {
      try { await fbSignOut(auth) } catch {}
      // Clear any deep-link hash so AppShell routes to 'home'.
      if (typeof window !== 'undefined') {
        if (window.location.hash) {
          window.location.hash = ''
        } else {
          // Force a re-render in case the route is already 'home' but the
          // signed-out state needs to take effect.
          window.dispatchEvent(new HashChangeEvent('hashchange'))
        }
      }
    },
    getIdToken: async () => (user ? await user.getIdToken() : null),
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  return useContext(AuthCtx)
}
