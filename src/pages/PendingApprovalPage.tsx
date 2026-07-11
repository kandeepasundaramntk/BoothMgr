import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { L, useT } from '../i18n'

/**
 * Shown in place of the app for signed-in users who are not approved yet
 * (or were rejected). No data routes are reachable in this state.
 */
export default function PendingApprovalPage() {
  const { profile, email, signOut, refreshProfile } = useAuth()
  const t = useT()
  const [checking, setChecking] = useState(false)

  const rejected = profile?.status === 'rejected'

  async function checkAgain() {
    setChecking(true)
    try {
      await refreshProfile()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="login-wrap card" style={{ textAlign: 'center' }}>
      {rejected ? (
        <>
          <h2 className="page-title" style={{ color: 'var(--accent-dark)' }}>
            <L ta="கணக்கு நிராகரிக்கப்பட்டது" en="Account rejected" />
          </h2>
          <p style={{ marginBottom: 16 }}>
            <L
              ta="உங்கள் பதிவு நிராகரிக்கப்பட்டது. மேலும் விவரங்களுக்கு நிர்வாகியை அல்லது உங்கள் தொகுதி பொறுப்பாளரைத் தொடர்பு கொள்ளவும்."
              en="Your registration was rejected. Contact the admin or your assembly POC for details."
            />
          </p>
        </>
      ) : (
        <>
          <h2 className="page-title">
            <L ta="ஒப்புதலுக்காக காத்திருக்கிறது" en="Waiting for approval" />
          </h2>
          <p style={{ marginBottom: 16 }}>
            <L
              ta="உங்கள் கணக்கு ஒப்புதலுக்காக காத்திருக்கிறது. நிர்வாகி அல்லது உங்கள் தொகுதி பொறுப்பாளர் ஒப்புதல் அளித்தவுடன் பயன்படுத்தலாம்."
              en="Your account is waiting for approval. You can use the app once an admin or your assembly POC approves you."
            />
          </p>
        </>
      )}
      <p className="hint" style={{ marginBottom: 16 }}>{email}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {!rejected && (
          <button className="btn secondary" onClick={() => void checkAgain()} disabled={checking}>
            {checking ? '…' : t('மீண்டும் சரிபார்', 'Check again')}
          </button>
        )}
        <button className="btn" onClick={() => void signOut()}>
          {t('வெளியேறு', 'Sign out')}
        </button>
      </div>
    </div>
  )
}
