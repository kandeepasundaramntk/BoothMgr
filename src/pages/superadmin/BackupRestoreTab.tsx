import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { getApi } from '../../data/api'
import { useActiveElection } from '../../election/ElectionContext'
import { L, useT } from '../../i18n'
import type { AssemblyBackup, RestoreResult } from '../../types'
import { exportAssemblyBackup } from '../../utils/exportJson'

export default function BackupRestoreTab() {
  const t = useT()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const { activeElectionId } = useActiveElection()
  const [assemblyId, setAssemblyId] = useState('')
  const [electionId, setElectionId] = useState('')
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState<RestoreResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })
  const elections = useQuery({
    queryKey: ['elections'],
    queryFn: async () => (await getApi()).listElections(),
  })
  const selected = assemblies.data?.find((a) => a.id === assemblyId)
  const selectedElection = elections.data?.find((e) => e.id === electionId)

  // Seed the election choice from the globally active election exactly once,
  // then leave it as an independent, superadmin-editable selection — backup/
  // restore is a data-defining operation, so the superadmin must be able to
  // pick a different election than whatever happens to be globally active.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !activeElectionId) return
    seeded.current = true
    setElectionId(activeElectionId)
  }, [activeElectionId])

  const restore = useMutation({
    mutationFn: async (backup: AssemblyBackup) => (await getApi()).restoreAssemblyBackup(assemblyId, electionId, backup),
    onSuccess: (r) => {
      setResult(r)
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['booths', assemblyId] })
    },
    onError: (e) => {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    },
  })

  async function onDownload() {
    if (!selected || !selectedElection) return
    setExporting(true)
    setError(null)
    try {
      await exportAssemblyBackup(selected, selectedElection)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !assemblyId || !electionId) return
    setResult(null)
    setError(null)
    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as AssemblyBackup
        if ((parsed as { format_version?: unknown }).format_version === 1) {
          throw new Error(
            t(
              'இது தேர்தல் சுழற்சிகள் சேர்க்கப்படுவதற்கு முந்தைய பழைய வடிவ காப்பு — இதை மீட்டெடுக்க முடியாது.',
              'This is an old-format backup from before election cycles were added — it cannot be restored.',
            ),
          )
        }
        if (parsed.format_version !== 2 || !Array.isArray(parsed.booths)) {
          throw new Error(t('செல்லுபடியாகாத காப்பு கோப்பு', 'Invalid backup file'))
        }
        restore.mutate(parsed)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  return (
    <div>
      <p className="hint">
        <L
          ta="மீட்பு என்பது இணைத்தல் (merge) — ஏற்கனவே உள்ள தரவை மேலெழுதாது, மேலும் தரவைச் சேர்க்கும்/புதுப்பிக்கும். தேர்ந்தெடுக்கப்பட்ட தேர்தலுக்குள் காப்பு எடுக்கப்பட்டு மீட்டெடுக்கப்படும் — கீழே சரியான தேர்தலைத் தேர்ந்தெடுக்கவும்."
          en="Restore merges into existing data (upsert) — it never wipes the assembly first. Backup and restore are scoped to the selected election — confirm the right election below before proceeding."
        />
      </p>
      <div className="toolbar">
        <select value={electionId} onChange={(e) => setElectionId(e.target.value)}>
          <option value="">{t('தேர்தலைத் தேர்ந்தெடு', 'Select an election')}</option>
          {elections.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.year})
            </option>
          ))}
        </select>
        <select value={assemblyId} onChange={(e) => setAssemblyId(e.target.value)}>
          <option value="">{t('தொகுதியைத் தேர்ந்தெடு', 'Select an assembly')}</option>
          {assemblies.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          className="btn small secondary"
          disabled={!selected || !selectedElection || exporting}
          onClick={() => void onDownload()}
        >
          {exporting ? '…' : t('காப்பு பதிவிறக்கு', 'Download backup')}
        </button>
        <button
          className="btn small secondary"
          disabled={!selected || !selectedElection || restore.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {restore.isPending ? '…' : t('காப்பிலிருந்து மீட்டெடு', 'Restore from backup')}
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFileChosen} />
      </div>
      {error && <div className="error">{error}</div>}
      {result && (
        <div className="hint">
          {t(
            `மீட்டெடுக்கப்பட்டது: ${result.booths_upserted} பூத்கள், ${result.party_votes_upserted} கட்சி வாக்குகள், ${result.castes_upserted} சாதிகள், ${result.religions_upserted} மதங்கள், ${result.influencers_upserted} செல்வாக்குமிக்கோர், ${result.actions_upserted} நடவடிக்கைகள்`,
            `Restored: ${result.booths_upserted} booths, ${result.party_votes_upserted} party votes, ${result.castes_upserted} castes, ${result.religions_upserted} religions, ${result.influencers_upserted} influencers, ${result.actions_upserted} actions`,
          )}
        </div>
      )}
    </div>
  )
}
