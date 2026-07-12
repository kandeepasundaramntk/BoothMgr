import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useEffectiveProfile } from '../auth/AuthContext'
import { getApi } from '../data/api'
import { useActiveElection } from '../election/ElectionContext'
import { L, useT } from '../i18n'
import type { Assembly } from '../types'
import { healthColor, healthLabel } from '../utils/health'

interface AssemblyEditFields {
  parliament_constituency_id: string
  constituency_code: string
  district: string
  state_code: string
}

function emptyEditFields(a: Assembly): AssemblyEditFields {
  return {
    parliament_constituency_id: a.parliament_constituency_id ?? '',
    constituency_code: a.constituency_code ?? '',
    district: a.district ?? '',
    state_code: a.state_code ?? '',
  }
}

export default function AssembliesPage() {
  const profile = useEffectiveProfile()
  const queryClient = useQueryClient()
  const t = useT()
  const { activeElectionId } = useActiveElection()
  const [name, setName] = useState('')
  const [pcId, setPcId] = useState('')
  const [constituencyCode, setConstituencyCode] = useState('')
  const [district, setDistrict] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<AssemblyEditFields | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })

  const parliamentConstituencies = useQuery({
    queryKey: ['parliamentConstituencies'],
    queryFn: async () => (await getApi()).listParliamentConstituencies(),
  })

  const pcById = new Map((parliamentConstituencies.data ?? []).map((pc) => [pc.id, pc]))

  const assemblySummaries = useQuery({
    queryKey: ['assemblySummaries', activeElectionId],
    queryFn: async () => (await getApi()).listAssemblySummaries(activeElectionId!),
    enabled: Boolean(activeElectionId),
  })

  const summaryByAssemblyId = new Map(
    (assemblySummaries.data ?? []).map((s) => [s.assembly_id, s]),
  )

  const create = useMutation({
    mutationFn: async (input: {
      name: string
      parliament_constituency_id?: string
      constituency_code?: string
      district?: string
      state_code?: string
    }) => (await getApi()).createAssembly(input),
    onSuccess: () => {
      setName('')
      setPcId('')
      setConstituencyCode('')
      setDistrict('')
      setStateCode('')
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['assemblies'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AssemblyEditFields> }) =>
      (await getApi()).updateAssembly(id, {
        ...patch,
        parliament_constituency_id: patch.parliament_constituency_id
          ? patch.parliament_constituency_id
          : null,
      }),
    onSuccess: () => {
      setEditingId(null)
      setEditFields(null)
      setEditError(null)
      void queryClient.invalidateQueries({ queryKey: ['assemblies'] })
    },
    onError: (e) => setEditError(e instanceof Error ? e.message : String(e)),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    create.mutate({
      name: name.trim(),
      parliament_constituency_id: pcId || undefined,
      constituency_code: constituencyCode.trim() || undefined,
      district: district.trim() || undefined,
      state_code: stateCode.trim() || undefined,
    })
  }

  function startEdit(a: Assembly) {
    setEditingId(a.id)
    setEditFields(emptyEditFields(a))
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditFields(null)
    setEditError(null)
  }

  function saveEdit(id: string) {
    if (!editFields) return
    update.mutate({ id, patch: editFields })
  }

  // Field workers belong to one assembly — take them straight there.
  if (profile && profile.role !== 'admin' && profile.role !== 'superadmin') {
    if (profile.assembly_id) return <Navigate to={`/assembly/${profile.assembly_id}`} replace />
    return (
      <div className="card">
        <p className="hint">
          <L
            ta="உங்கள் கணக்கிற்கு தொகுதி எதுவும் இணைக்கப்படவில்லை — நிர்வாகியைத் தொடர்பு கொள்ளவும்."
            en="No assembly is linked to your account — contact the admin."
          />
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="page-title">
        <L ta="சட்டமன்றத் தொகுதிகள்" en="Assemblies" />
      </h2>
      <div className="toolbar no-print">
        <span className="grow" />
        <Link className="btn small secondary" to="/blank-form">
          {t('வெற்றுப் படிவம் அச்சிடு', 'Print blank form')}
        </Link>
      </div>
      {error && <div className="error">{error}</div>}
      {!activeElectionId && (
        <p className="hint">
          <L
            ta="ஆரோக்கிய குறியீடுகளைக் காண தேர்தலைத் தேர்ந்தெடுக்கவும்."
            en="Select an election to see health chips."
          />
        </p>
      )}
      {assemblies.isLoading && <p>Loading…</p>}
      {assemblies.isError && <div className="error">{String(assemblies.error)}</div>}
      {assemblies.data && assemblies.data.length === 0 && (
        <p className="hint">
          <L ta="தொகுதிகள் எதுவும் இல்லை — கீழே ஒன்றைச் சேர்க்கவும்." en="No assemblies yet — add one below." />
        </p>
      )}
      {assemblies.data && assemblies.data.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th>
                <L ta="தொகுதி" en="Assembly" />
              </th>
              <th>
                <L ta="மக்களவைத் தொகுதி" en="Parliament Constituency" />
              </th>
              <th>
                <L ta="ஆரோக்கியம்" en="Health" />
              </th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {assemblies.data.map((a) => {
              const isEditing = editingId === a.id
              return (
                <tr key={a.id}>
                  <td>
                    <Link to={`/assembly/${a.id}`}>{a.name}</Link>
                  </td>
                  <td>
                    {isEditing && editFields ? (
                      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 6 }}>
                        <select
                          value={editFields.parliament_constituency_id}
                          onChange={(e) =>
                            setEditFields({ ...editFields, parliament_constituency_id: e.target.value })
                          }
                        >
                          <option value="">{t('—', '—')}</option>
                          {(parliamentConstituencies.data ?? []).map((pc) => (
                            <option key={pc.id} value={pc.id}>
                              {pc.name}
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder={t('தொகுதி குறியீடு', 'Constituency code')}
                          value={editFields.constituency_code}
                          onChange={(e) => setEditFields({ ...editFields, constituency_code: e.target.value })}
                          style={{ width: 110 }}
                        />
                        <input
                          placeholder={t('மாவட்டம்', 'District')}
                          value={editFields.district}
                          onChange={(e) => setEditFields({ ...editFields, district: e.target.value })}
                          style={{ width: 120 }}
                        />
                        <input
                          placeholder={t('மாநிலக் குறியீடு', 'State code')}
                          value={editFields.state_code}
                          onChange={(e) => setEditFields({ ...editFields, state_code: e.target.value })}
                          style={{ width: 90 }}
                        />
                        {editError && <div className="error">{editError}</div>}
                      </div>
                    ) : (
                      pcById.get(a.parliament_constituency_id ?? '')?.name ?? '—'
                    )}
                  </td>
                  <td>
                    {activeElectionId ? (
                      <span
                        className="pill"
                        style={{ background: healthColor(summaryByAssemblyId.get(a.id)?.avg_committed_pct ?? null) }}
                      >
                        {healthLabel(summaryByAssemblyId.get(a.id)?.avg_committed_pct ?? null)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="toolbar" style={{ flexWrap: 'nowrap', gap: 6 }}>
                      <Link className="btn small secondary" to={`/assembly/${a.id}/dashboard`}>
                        {t('டாஷ்போர்டு', 'Dashboard')}
                      </Link>
                      {profile?.role === 'superadmin' &&
                        (isEditing ? (
                          <>
                            <button
                              className="btn small"
                              type="button"
                              disabled={update.isPending}
                              onClick={() => saveEdit(a.id)}
                            >
                              {t('சேமி', 'Save')}
                            </button>
                            <button className="btn small secondary" type="button" onClick={cancelEdit}>
                              {t('ரத்து', 'Cancel')}
                            </button>
                          </>
                        ) : (
                          <button className="btn small secondary" type="button" onClick={() => startEdit(a)}>
                            {t('திருத்து', 'Edit')}
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {profile?.role === 'superadmin' && (
        <form className="toolbar" style={{ marginTop: 14, flexWrap: 'wrap', gap: 8 }} onSubmit={onSubmit}>
          <input
            placeholder={t('புதிய தொகுதியின் பெயர்', 'New assembly name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ minWidth: 260 }}
          />
          <select value={pcId} onChange={(e) => setPcId(e.target.value)}>
            <option value="">{t('மக்களவைத் தொகுதி — இல்லை', 'Parliament constituency — none')}</option>
            {(parliamentConstituencies.data ?? []).map((pc) => (
              <option key={pc.id} value={pc.id}>
                {pc.name}
              </option>
            ))}
          </select>
          <input
            placeholder={t('தொகுதி குறியீடு', 'Constituency code')}
            value={constituencyCode}
            onChange={(e) => setConstituencyCode(e.target.value)}
            style={{ width: 130 }}
          />
          <input
            placeholder={t('மாவட்டம்', 'District')}
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            style={{ width: 140 }}
          />
          <input
            placeholder={t('மாநிலக் குறியீடு', 'State code')}
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            style={{ width: 100 }}
          />
          <button className="btn" type="submit" disabled={create.isPending || !name.trim()}>
            {t('சேர்', 'Add')}
          </button>
        </form>
      )}
    </div>
  )
}
