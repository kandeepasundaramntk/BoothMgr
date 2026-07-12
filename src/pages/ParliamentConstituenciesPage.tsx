import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useEffectiveProfile } from '../auth/AuthContext'
import { getApi } from '../data/api'
import { L, useT } from '../i18n'

export default function ParliamentConstituenciesPage() {
  const profile = useEffectiveProfile()
  const queryClient = useQueryClient()
  const t = useT()
  const [name, setName] = useState('')
  const [pcCode, setPcCode] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isSuperadmin = profile?.role === 'superadmin'

  const pcs = useQuery({
    queryKey: ['parliament-constituencies'],
    queryFn: async () => (await getApi()).listParliamentConstituencies(),
  })

  const create = useMutation({
    mutationFn: async (input: { name: string; pc_code?: string; state_code?: string }) =>
      (await getApi()).createParliamentConstituency(input),
    onSuccess: () => {
      setName('')
      setPcCode('')
      setStateCode('')
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['parliament-constituencies'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) {
      create.mutate({
        name: name.trim(),
        pc_code: pcCode.trim() || undefined,
        state_code: stateCode.trim() || undefined,
      })
    }
  }

  // Only admins/superadmins have any business here — field workers belong to
  // one assembly and never manage the PC list.
  if (profile && profile.role !== 'admin' && profile.role !== 'superadmin') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="card">
      <div className="toolbar">
        <Link to="/">← {t('தொகுதிகள்', 'Assemblies')}</Link>
      </div>
      <h2 className="page-title">
        <L ta="நாடாளுமன்றத் தொகுதிகள்" en="Parliament Constituencies" />
      </h2>
      {error && <div className="error">{error}</div>}
      {pcs.isLoading && <p>Loading…</p>}
      {pcs.isError && <div className="error">{String(pcs.error)}</div>}
      {pcs.data && pcs.data.length === 0 && (
        <p className="hint">
          <L
            ta="நாடாளுமன்றத் தொகுதிகள் எதுவும் இல்லை — கீழே ஒன்றைச் சேர்க்கவும்."
            en="No parliament constituencies yet — add one below."
          />
        </p>
      )}
      {pcs.data && pcs.data.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th>
                <L ta="பெயர்" en="Name" />
              </th>
              <th>
                <L ta="குறியீடு" en="PC Code" />
              </th>
              <th>
                <L ta="மாநிலக் குறியீடு" en="State Code" />
              </th>
            </tr>
          </thead>
          <tbody>
            {pcs.data.map((pc) => (
              <tr key={pc.id}>
                <td>
                  <Link to={`/parliament-constituencies/${pc.id}`}>{pc.name}</Link>
                </td>
                <td>{pc.pc_code}</td>
                <td>{pc.state_code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isSuperadmin && (
        <form className="toolbar" style={{ marginTop: 14 }} onSubmit={onSubmit}>
          <input
            placeholder={t('புதிய தொகுதியின் பெயர்', 'New PC name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <input
            placeholder={t('குறியீடு', 'PC code')}
            value={pcCode}
            onChange={(e) => setPcCode(e.target.value)}
            style={{ minWidth: 100 }}
          />
          <input
            placeholder={t('மாநிலக் குறியீடு', 'State code')}
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            style={{ minWidth: 100 }}
          />
          <button className="btn" type="submit" disabled={create.isPending || !name.trim()}>
            {t('சேர்', 'Add')}
          </button>
        </form>
      )}
    </div>
  )
}
