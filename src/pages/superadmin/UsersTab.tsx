import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useAuth, useViewAs } from '../../auth/AuthContext'
import { getApi } from '../../data/api'
import { ROLE_LABEL } from '../../data/roles'
import { L, useLang, useT } from '../../i18n'
import type { UserRole, UserStatus } from '../../types'
import { assemblyLabel } from '../../utils/assemblyLabel'

const STATUS_LABEL: Record<UserStatus, { ta: string; en: string }> = {
  pending: { ta: 'காத்திருப்பு', en: 'Pending' },
  approved: { ta: 'ஒப்புதல் பெற்றது', en: 'Approved' },
  rejected: { ta: 'நிராகரிக்கப்பட்டது', en: 'Rejected' },
}

export default function UsersTab() {
  const { profile: me } = useAuth()
  const { startViewAs, isViewingAs } = useViewAs()
  const { lang } = useLang()
  const t = useT()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('')
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('')
  const [error, setError] = useState<string | null>(null)

  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => (await getApi()).listProfiles(),
  })
  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })

  const assemblyName = (id: string | null) => {
    if (id === null) return '—'
    const a = assemblies.data?.find((a) => a.id === id)
    return a ? assemblyLabel(a) : '…'
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (profiles.data ?? [])
      .filter((p) => !roleFilter || p.role === roleFilter)
      .filter((p) => !statusFilter || p.status === statusFilter)
      .filter((p) => !q || p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .sort((a, b) => a.full_name.localeCompare(b.full_name) || a.email.localeCompare(b.email))
  }, [profiles.data, search, roleFilter, statusFilter])

  async function onViewAs(userId: string) {
    setError(null)
    const target = profiles.data?.find((p) => p.id === userId)
    if (!target) return
    try {
      await startViewAs(target)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder={t('தேடு (பெயர்/மின்னஞ்சல்)', 'Search (name/email)')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}>
          <option value="">{t('அனைத்து பங்குகள்', 'All roles')}</option>
          <option value="superadmin">{t(ROLE_LABEL.superadmin.ta, ROLE_LABEL.superadmin.en)}</option>
          <option value="admin">{t(ROLE_LABEL.admin.ta, ROLE_LABEL.admin.en)}</option>
          <option value="assembly_poc">{t(ROLE_LABEL.assembly_poc.ta, ROLE_LABEL.assembly_poc.en)}</option>
          <option value="member">{t(ROLE_LABEL.member.ta, ROLE_LABEL.member.en)}</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as UserStatus | '')}>
          <option value="">{t('அனைத்து நிலைகள்', 'All statuses')}</option>
          <option value="pending">{t(STATUS_LABEL.pending.ta, STATUS_LABEL.pending.en)}</option>
          <option value="approved">{t(STATUS_LABEL.approved.ta, STATUS_LABEL.approved.en)}</option>
          <option value="rejected">{t(STATUS_LABEL.rejected.ta, STATUS_LABEL.rejected.en)}</option>
        </select>
        <span className="grow" />
        <span className="hint">
          {filtered.length} / {profiles.data?.length ?? 0}
        </span>
      </div>
      {error && <div className="error">{error}</div>}
      {profiles.isLoading && <p>Loading…</p>}
      {profiles.isError && <div className="error">{String(profiles.error)}</div>}
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
            <th>
              <L ta="நிலை" en="Status" />
            </th>
            <th>
              <L ta="சேர்ந்த நாள்" en="Joined" />
            </th>
            <th style={{ width: 140 }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td>{p.full_name || '—'}</td>
              <td>{p.email}</td>
              <td>{assemblyName(p.assembly_id)}</td>
              <td>
                <L ta={ROLE_LABEL[p.role].ta} en={ROLE_LABEL[p.role].en} />
              </td>
              <td>
                <L ta={STATUS_LABEL[p.status].ta} en={STATUS_LABEL[p.status].en} />
              </td>
              <td>{new Date(p.created_at).toLocaleDateString(lang === 'ta' ? 'ta-IN' : 'en-IN')}</td>
              <td>
                {p.id !== me?.id && (
                  <button className="btn small secondary" disabled={isViewingAs} onClick={() => void onViewAs(p.id)}>
                    {t('பார்வையிடு', 'View as')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
