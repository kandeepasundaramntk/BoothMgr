import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasSupabaseConfig, isDemoMode } from '../data/api'

export default function LoginPage() {
  const { signedIn, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (signedIn) return <Navigate to="/" replace />

  const configured = isDemoMode || hasSupabaseConfig()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap card">
      <h2 className="page-title">BoothMgr — உள்நுழைவு / Sign in</h2>
      {isDemoMode && (
        <p className="hint" style={{ marginBottom: 12 }}>
          Demo mode: any email/password works; data stays in this browser.
        </p>
      )}
      {!configured && (
        <div className="error">
          Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code> and fill in
          the project URL and anon key, or set <code>VITE_DEMO=1</code> for demo mode.
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label>
            மின்னஞ்சல் <span className="en">(Email)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label>
            கடவுச்சொல் <span className="en">(Password)</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!isDemoMode}
            autoComplete="current-password"
          />
        </div>
        <button className="btn" type="submit" disabled={busy || !configured}>
          {busy ? '…' : 'உள்நுழை / Sign in'}
        </button>
      </form>
    </div>
  )
}
