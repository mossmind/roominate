import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App'
import MobileApp from './MobileApp'

const isMobile = Capacitor.isNativePlatform()
const isWeb = !isMobile && !(typeof window !== 'undefined' && !!(window as any).storage)

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

  if (!authed) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#242329', fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: 320 }}>
        <div style={{ fontFamily: "'Cormorant', Georgia, serif", fontSize: 36, fontWeight: 600, color: '#F4EDEA' }}>MossMind</div>
        <div style={{ width: 40, height: 2, background: '#657946' }} />
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password…"
            autoFocus
            style={{ fontFamily: 'monospace', fontSize: 14, color: '#F4EDEA', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 0, padding: '12px 14px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          {error && <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#EF9982' }}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{ background: '#657946', color: '#fff', border: 'none', borderRadius: 0, padding: '12px', fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", fontSize: 13, fontWeight: 800, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
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
