import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App'
import MobileApp from './MobileApp'

const isNative = Capacitor.isNativePlatform()
const isElectron = typeof window !== 'undefined' && !!(window as any).storage
const isMobile = isNative
const isWeb = !isNative && !isElectron

function PasswordGate({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/check', { method: 'POST' })
      .then(r => r.json())
      .then(d => { setAuthed(d.ok); setChecked(true) })
      .catch(() => { setAuthed(false); setChecked(true) })
  }, [])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (data.ok) { setAuthed(true) }
      else { setError('Incorrect password') }
    } catch { setError('Connection error') }
    setLoading(false)
  }

  if (!checked) return null

  // Matches the main app's neo-brutalist design system (App.tsx: the T token
  // palette, tb() hard borders, flat offset shadows, Poppins). Hardcoded here
  // rather than imported because this gate renders before App mounts, so
  // App's CSS-variable :root block and @import don't exist yet.
  const canvas = '#F1EAE3', surface = '#F7F3F0', surfaceMuted = '#D9D1CB';
  const ink = '#261B18', inkMuted = '#736A65', inside = '#509744', urgent = '#D9564A';
  const font = "'Poppins', system-ui, sans-serif";

  if (!authed) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: canvas, fontFamily: font }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,700;0,800;0,900&display=swap');
        .login-btn { transition: transform 0.1s ease, box-shadow 0.1s ease; }
        .login-btn:hover:not(:disabled) { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 ${ink}; }
        .login-btn:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: none; }
        .login-input:focus { border-color: ${ink}; }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: 360, maxWidth: '90vw', background: surface, border: `2.5px solid ${ink}`, boxShadow: `6px 6px 0 ${ink}`, borderRadius: 10, padding: '40px 36px', boxSizing: 'border-box' }}>
        <div style={{ fontFamily: font, fontSize: 28, fontWeight: 800, color: ink }}>MossMind</div>
        <div style={{ width: 40, height: 3, background: inside, borderRadius: 2 }} />
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <input
            className="login-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password…"
            autoFocus
            style={{ fontFamily: font, fontSize: 14, color: ink, background: surfaceMuted, border: `2px solid ${ink}`, borderRadius: 8, padding: '12px 14px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          {error && <div style={{ fontFamily: font, fontSize: 12, fontWeight: 700, color: '#261B18', background: urgent, borderRadius: 8, padding: '6px 10px' }}>{error}</div>}
          <button type="submit" disabled={loading} className="login-btn"
            style={{ background: inside, color: ink, border: `2px solid ${ink}`, boxShadow: `2px 2px 0 ${ink}`, borderRadius: 8, padding: '12px', fontFamily: font, fontSize: 13, fontWeight: 900, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
        <div style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: inkMuted }}>Private workspace</div>
      </div>
    </div>
  )

  return <>{children}</>
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isMobile
      ? <MobileApp />
      : isWeb
        ? <PasswordGate><App /></PasswordGate>
        : <App />
    }
  </React.StrictMode>
)
