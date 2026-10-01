import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App'
import MobileApp from './MobileApp'
import MossmindLogo from './assets/Logos/Mossmind.svg?react'

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

  // Matches the main app's design system (App.tsx: the T token palette,
  // tb() hard borders, flat offset shadows, Lora) — reverted to the
  // original dark/organic palette. Hardcoded here rather than imported
  // because this gate renders before App mounts, so App's CSS-variable
  // :root block and @import don't exist yet.
  const canvas = '#242329', surface = '#322F35', surfaceMuted = '#1C1A1E';
  const ink = '#F4EDEA', inkMuted = '#ABA29D', inside = '#657946', urgent = '#EF9982';
  const onAccent = '#242329'; // fixed dark text for content on top of a solid accent fill
  const font = "'Lora', Georgia, serif";

  if (!authed) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: canvas, fontFamily: font }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400&display=swap');
        .login-btn { transition: transform 0.1s ease, opacity 0.1s ease; }
        .login-btn:hover:not(:disabled) { opacity: 0.9; }
        .login-btn:active:not(:disabled) { transform: translate(1px, 1px); }
        .login-input:focus { box-shadow: 0 0 0 2px ${ink}; }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: 360, maxWidth: '90vw', background: surface, borderRadius: 10, padding: '40px 36px', boxSizing: 'border-box' }}>
        <MossmindLogo aria-label="MossMind" style={{ height: 30, width: 'auto', color: ink, display: 'block' }} />
        <div style={{ width: 40, height: 3, background: inside, borderRadius: 2 }} />
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <input
            className="login-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password…"
            autoFocus
            style={{ fontFamily: font, fontSize: 16, color: ink, background: surfaceMuted, border: 'none', borderRadius: 8, padding: '12px 14px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          {error && <div style={{ fontFamily: font, fontSize: 14, fontWeight: 700, color: onAccent, background: urgent, borderRadius: 8, padding: '6px 10px' }}>{error}</div>}
          <button type="submit" disabled={loading} className="login-btn"
            style={{ background: inside, color: onAccent, border: 'none', borderRadius: 8, padding: '12px', fontFamily: font, fontSize: 15, fontWeight: 900, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
        <div style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: inkMuted }}>Private workspace</div>
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
