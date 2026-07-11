import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { getApi } from '../../data/api'
import { L, useLang, useT } from '../../i18n'
import type { Election } from '../../types'

const STATUS_LABEL: Record<Election['status'], { ta: string; en: string }> = {
  upcoming: { ta: 'வரவிருக்கும்', en: 'Upcoming' },
  active: { ta: 'செயலில்', en: 'Active' },
  archived: { ta: 'காப்பகப்படுத்தப்பட்டது', en: 'Archived' },
}

export default function ElectionsTab() {
  const { lang } = useLang()
  const t = useT()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [year, setYear] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  const elections = useQuery({
    queryKey: ['elections'],
    queryFn: async () => (await getApi()).listElections(),
  })

  const create = useMutation({
    mutationFn: async (input: { name: string; year: number }) => (await getApi()).createElection(input),
    onSuccess: () => {
      setName('')
      setYear('')
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['elections'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Election['status'] }) =>
      (await getApi()).setElectionStatus(id, status),
    onSuccess: () => {
      setStatusError(null)
      void queryClient.invalidateQueries({ queryKey: ['elections'] })
    },
    onError: (e) => setStatusError(e instanceof Error ? e.message : String(e)),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    const parsedYear = Number(year)
    if (!trimmedName || !year.trim() || !Number.isInteger(parsedYear)) return
    create.mutate({ name: trimmedName, year: parsedYear })
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {statusError && <div className="error">{statusError}</div>}
      {elections.isLoading && <p>Loading…</p>}
      {elections.isError && <div className="error">{String(elections.error)}</div>}
      <table className="data">
        <thead>
          <tr>
            <th>
              <L ta="பெயர்" en="Name" />
            </th>
            <th>
              <L ta="ஆண்டு" en="Year" />
            </th>
            <th>
              <L ta="நிலை" en="Status" />
            </th>
            <th>
              <L ta="உருவாக்கப்பட்ட நாள்" en="Created" />
            </th>
            <th style={{ width: 160 }}></th>
          </tr>
        </thead>
        <tbody>
          {(elections.data ?? []).map((election) => (
            <tr key={election.id}>
              <td>{election.name}</td>
              <td>{election.year}</td>
              <td>
                <L ta={STATUS_LABEL[election.status].ta} en={STATUS_LABEL[election.status].en} />
              </td>
              <td>{new Date(election.created_at).toLocaleDateString(lang === 'ta' ? 'ta-IN' : 'en-IN')}</td>
              <td>
                <select
                  value={election.status}
                  disabled={setStatus.isPending}
                  onChange={(e) =>
                    setStatus.mutate({ id: election.id, status: e.target.value as Election['status'] })
                  }
                >
                  <option value="upcoming">{t(STATUS_LABEL.upcoming.ta, STATUS_LABEL.upcoming.en)}</option>
                  <option value="active">{t(STATUS_LABEL.active.ta, STATUS_LABEL.active.en)}</option>
                  <option value="archived">{t(STATUS_LABEL.archived.ta, STATUS_LABEL.archived.en)}</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="toolbar" style={{ marginTop: 14, flexWrap: 'wrap', gap: 8 }} onSubmit={onSubmit}>
        <input
          placeholder={t('புதிய தேர்தலின் பெயர்', 'New election name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <input
          type="number"
          step={1}
          placeholder={t('ஆண்டு', 'Year')}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          style={{ width: 110 }}
        />
        <button
          className="btn"
          type="submit"
          disabled={create.isPending || !name.trim() || !year.trim() || !Number.isInteger(Number(year))}
        >
          {t('சேர்', 'Add')}
        </button>
      </form>
    </div>
  )
}
