import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ACTIVITY_ACTION_TYPES, describeActionType } from '../../data/activityLog'
import { getApi } from '../../data/api'
import { L, useT } from '../../i18n'
import type { ActivityLogFilter } from '../../types'
import { assemblyLabel } from '../../utils/assemblyLabel'

const PAGE_SIZE = 25

export default function ActivityLogTab() {
  const t = useT()
  const [assemblyId, setAssemblyId] = useState('')
  const [actorId, setActorId] = useState('')
  const [actionType, setActionType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)

  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })
  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => (await getApi()).listProfiles(),
  })

  const filter: ActivityLogFilter = {
    assemblyId: assemblyId || undefined,
    actorId: actorId || undefined,
    actionType: actionType || undefined,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }

  const log = useQuery({
    queryKey: ['activityLog', filter],
    queryFn: async () => (await getApi()).getActivityLog(filter),
  })

  const assemblyName = (id: string | null) => {
    if (id === null) return '—'
    const a = assemblies.data?.find((a) => a.id === id)
    return a ? assemblyLabel(a) : '…'
  }

  function withReset<T>(setter: (v: T) => void): (v: T) => void {
    return (v: T) => {
      setPage(0)
      setter(v)
    }
  }

  const totalCount = log.data?.totalCount ?? 0
  const hasNext = (page + 1) * PAGE_SIZE < totalCount

  return (
    <div>
      <div className="toolbar">
        <select value={assemblyId} onChange={(e) => withReset(setAssemblyId)(e.target.value)}>
          <option value="">{t('அனைத்து தொகுதிகள்', 'All assemblies')}</option>
          {assemblies.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {assemblyLabel(a)}
            </option>
          ))}
        </select>
        <select value={actorId} onChange={(e) => withReset(setActorId)(e.target.value)}>
          <option value="">{t('அனைத்து பயனர்கள்', 'All users')}</option>
          {profiles.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email}
            </option>
          ))}
        </select>
        <select value={actionType} onChange={(e) => withReset(setActionType)(e.target.value)}>
          <option value="">{t('அனைத்து செயல்கள்', 'All actions')}</option>
          {ACTIVITY_ACTION_TYPES.map((at) => {
            const label = describeActionType(at)
            return (
              <option key={at} value={at}>
                {t(label.ta, label.en)}
              </option>
            )
          })}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => withReset(setDateFrom)(e.target.value)} />
        <input type="date" value={dateTo} onChange={(e) => withReset(setDateTo)(e.target.value)} />
      </div>
      {log.isLoading && <p>Loading…</p>}
      {log.isError && <div className="error">{String(log.error)}</div>}
      <table className="data">
        <thead>
          <tr>
            <th>
              <L ta="நேரம்" en="Time" />
            </th>
            <th>
              <L ta="செய்தவர்" en="Actor" />
            </th>
            <th>
              <L ta="செயல்" en="Action" />
            </th>
            <th>
              <L ta="தொகுதி" en="Assembly" />
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(log.data?.rows ?? []).map((row) => {
            const label = describeActionType(row.action_type)
            return (
              <tr key={row.id}>
                <td>{new Date(row.created_at).toLocaleString()}</td>
                <td>{row.actor_full_name || row.actor_email || '—'}</td>
                <td>
                  <L ta={label.ta} en={label.en} />
                </td>
                <td>{assemblyName(row.assembly_id)}</td>
                <td>
                  <details>
                    <summary>{t('விவரங்கள்', 'Details')}</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify(row.details, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="toolbar">
        <button className="btn small secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          {t('முந்தையது', 'Previous')}
        </button>
        <span className="hint">{t(`பக்கம் ${page + 1} — மொத்தம் ${totalCount}`, `Page ${page + 1} — ${totalCount} total`)}</span>
        <button className="btn small secondary" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
          {t('அடுத்தது', 'Next')}
        </button>
      </div>
    </div>
  )
}
