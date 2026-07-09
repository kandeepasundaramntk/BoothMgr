import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getApi, hasSupabaseConfig, isDemoMode } from '../data/api'
import { L, useT } from '../i18n'

export default function SignupPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [assemblyId, setAssemblyId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const configured = isDemoMode || hasSupabaseConfig()

  const assemblies = useQuery({
    queryKey: ['signup-assemblies'],
    queryFn: async () => (await getApi()).listSignupAssemblies(),
    enabled: configured,
  })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signUp({ full_name: fullName, phone, email, password, assembly_id: assemblyId })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap card">
      <h2 className="page-title">BoothMgr — {t('புதிய பதிவு', 'Sign up')}</h2>
      <p className="hint" style={{ marginBottom: 12 }}>
        <L
          ta="பதிவு செய்த பிறகு, நிர்வாகி அல்லது உங்கள் தொகுதி பொறுப்பாளர் ஒப்புதல் அளித்தவுடன் பயன்படுத்தலாம்."
          en="After signing up, you can use the app once an admin or your assembly POC approves you."
        />
      </p>
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
            <L ta="பெயர்" en="Name" />
          </label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
        </div>
        <div className="field">
          <label>
            <L ta="கைபேசி எண்" en="Phone" />
          </label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" />
        </div>
        <div className="field">
          <label>
            <L ta="மின்னஞ்சல்" en="Email" />
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
            <L ta="கடவுச்சொல்" en="Password" />
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!isDemoMode}
            minLength={isDemoMode ? undefined : 6}
            autoComplete="new-password"
          />
        </div>
        <div className="field">
          <label>
            <L ta="சட்டமன்றத் தொகுதி" en="Assembly" />
          </label>
          <select value={assemblyId} onChange={(e) => setAssemblyId(e.target.value)} required>
            <option value="">{t('தேர்வு செய்யவும்', 'Choose…')}</option>
            {(assemblies.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" type="submit" disabled={busy || !configured}>
          {busy ? '…' : t('பதிவு செய்', 'Sign up')}
        </button>
      </form>
      <p style={{ marginTop: 14 }}>
        <Link to="/login">
          ← <L ta="ஏற்கனவே கணக்கு உள்ளதா? உள்நுழை" en="Already have an account? Sign in" />
        </Link>
      </p>
    </div>
  )
}
