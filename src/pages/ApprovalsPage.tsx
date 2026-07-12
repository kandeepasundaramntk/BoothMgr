import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth, useEffectiveProfile } from '../auth/AuthContext'
import { getApi } from '../data/api'
import { ROLE_LABEL } from '../data/roles'
import { L, useT } from '../i18n'
import type { Profile, UserRole } from '../types'
import { assemblyLabel } from '../utils/assemblyLabel'

/** User approval queue for admins and assembly POCs; role management for admins. */
export default function ApprovalsPage() {
  // `me` is the real signed-in user (used for identity, e.g. excluding your
  // own row below) — role-gating uses the effective (possibly view-as) profile.
  const { profile: me } = useAuth()
  const effectiveProfile = useEffectiveProfile()
  const queryClient = useQueryClient()
  const t = useT()
  const [error, setError] = useState<string | null>(null)

  const canApprove =
    effectiveProfile?.role === 'admin' || effectiveProfile?.role === 'superadmin' || effectiveProfile?.role === 'assembly_poc'
  const isAdminLike = effectiveProfile?.role === 'admin' || effectiveProfile?.role === 'superadmin'
  const isSuperadmin = effectiveProfile?.role === 'superadmin'

  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => (await getApi()).listProfiles(),
    enabled: canApprove,
  })
  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
    enabled: canApprove,
  })

  const onDone = () => {
    setError(null)
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
  }
  const onError = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  const approve = useMutation({
    mutationFn: async (id: string) => (await getApi()).approveProfile(id),
    onSuccess: onDone,
    onError,
  })
  const reject = useMutation({
    mutationFn: async (id: string) => (await getApi()).rejectProfile(id),
    onSuccess: onDone,
    onError,
  })
  const setRole = useMutation({
    mutationFn: async (args: { id: string; role: UserRole }) => (await getApi()).setProfileRole(args.id, args.role),
    onSuccess: onDone,
    onError,
  })

  if (!canApprove) return <Navigate to="/" replace />

  const assemblyName = (id: string | null) => {
    if (id === null) return '—'
    const a = assemblies.data?.find((a) => a.id === id)
    return a ? assemblyLabel(a) : '…'
  }

  const all = profiles.data ?? []
  const pending = all.filter((p) => p.status === 'pending')
  const others = all.filter((p) => p.status !== 'pending' && p.id !== me?.id)

  const busy = approve.isPending || reject.isPending || setRole.isPending

  return (
    <div className="card">
      <div className="toolbar">
        <Link to="/">← {t('தொகுதிகள்', 'Assemblies')}</Link>
      </div>
      <h2 className="page-title">
        <L ta="ஒப்புதல்கள்" en="Approvals" />
      </h2>
      {error && <div className="error">{error}</div>}
      {profiles.isLoading && <p>Loading…</p>}
      {profiles.isError && <div className="error">{String(profiles.error)}</div>}

      <h3 className="section">
        <L ta="காத்திருப்போர்" en="Pending" />
      </h3>
      {pending.length === 0 && !profiles.isLoading && (
        <p className="hint">
          <L ta="ஒப்புதலுக்கு யாரும் இல்லை." en="No one waiting for approval." />
        </p>
      )}
      {pending.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th>
                <L ta="பெயர்" en="Name" />
              </th>
              <th>
                <L ta="கைபேசி" en="Phone" />
              </th>
              <th>
                <L ta="மின்னஞ்சல்" en="Email" />
              </th>
              <th>
                <L ta="தொகுதி" en="Assembly" />
              </th>
              <th style={{ width: 230 }}></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((p) => (
              <tr key={p.id}>
                <td>{p.full_name || '—'}</td>
                <td>{p.phone || '—'}</td>
                <td>{p.email}</td>
                <td>{assemblyName(p.assembly_id)}</td>
                <td>
                  <button className="btn small" disabled={busy} onClick={() => approve.mutate(p.id)}>
                    ✓ {t('ஒப்புதல்', 'Approve')}
                  </button>{' '}
                  <button
                    className="btn small secondary"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(t(`${p.full_name || p.email} — நிராகரிக்கவா?`, `Reject ${p.full_name || p.email}?`))) {
                        reject.mutate(p.id)
                      }
                    }}
                  >
                    ✕ {t('நிராகரி', 'Reject')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isAdminLike && others.length > 0 && (
        <>
          <h3 className="section">
            <L ta="உறுப்பினர்கள்" en="Members" />
          </h3>
          <table className="data">
            <thead>
              <tr>
                <th>
                  <L ta="பெயர்" en="Name" />
                </th>
                <th>
                  <L ta="மின்னஞ்சல்" en="Email" />
                </th>
                <th>
                  <L ta="தொகுதி" en="Assembly" />
                </th>
                <th>
                  <L ta="பங்கு" en="Role" />
                </th>
                <th style={{ width: 230 }}></th>
              </tr>
            </thead>
            <tbody>
              {others.map((p: Profile) => (
                <tr key={p.id}>
                  <td>{p.full_name || '—'}</td>
                  <td>{p.email}</td>
                  <td>{assemblyName(p.assembly_id)}</td>
                  <td>
                    <L ta={ROLE_LABEL[p.role].ta} en={ROLE_LABEL[p.role].en} />
                    {p.status === 'rejected' && (
                      <span className="warn-text"> — <L ta="நிராகரிக்கப்பட்டது" en="rejected" /></span>
                    )}
                  </td>
                  <td>
                    {isSuperadmin ? (
                      <select
                        value={p.role}
                        disabled={busy}
                        onChange={(e) => setRole.mutate({ id: p.id, role: e.target.value as UserRole })}
                      >
                        <option value="member">{t(ROLE_LABEL.member.ta, ROLE_LABEL.member.en)}</option>
                        <option value="assembly_poc">{t(ROLE_LABEL.assembly_poc.ta, ROLE_LABEL.assembly_poc.en)}</option>
                        <option value="admin">{t(ROLE_LABEL.admin.ta, ROLE_LABEL.admin.en)}</option>
                        <option value="superadmin">{t(ROLE_LABEL.superadmin.ta, ROLE_LABEL.superadmin.en)}</option>
                      </select>
                    ) : (
                      <>
                        {p.role === 'member' && p.status === 'approved' && (
                          <button
                            className="btn small secondary"
                            disabled={busy}
                            onClick={() => setRole.mutate({ id: p.id, role: 'assembly_poc' })}
                          >
                            {t('பொறுப்பாளராக்கு', 'Make POC')}
                          </button>
                        )}
                        {p.role === 'assembly_poc' && (
                          <button
                            className="btn small secondary"
                            disabled={busy}
                            onClick={() => setRole.mutate({ id: p.id, role: 'member' })}
                          >
                            {t('உறுப்பினராக்கு', 'Make member')}
                          </button>
                        )}
                      </>
                    )}
                    {p.status === 'rejected' && (
                      <button className="btn small" disabled={busy} onClick={() => approve.mutate(p.id)}>
                        ✓ {t('ஒப்புதல்', 'Approve')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
