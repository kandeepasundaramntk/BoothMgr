import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ChangeEvent } from 'react'
import { getApi } from '../../data/api'
import { L, useT } from '../../i18n'
import type { AssemblyBackup, RestoreResult } from '../../types'
import { exportAssemblyBackup } from '../../utils/exportJson'

export default function BackupRestoreTab() {
  const t = useT()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [assemblyId, setAssemblyId] = useState('')
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState<RestoreResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })
  const selected = assemblies.data?.find((a) => a.id === assemblyId)

  const restore = useMutation({
    mutationFn: async (backup: AssemblyBackup) => (await getApi()).restoreAssemblyBackup(assemblyId, backup),
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
    if (!selected) return
    setExporting(true)
    setError(null)
    try {
      await exportAssemblyBackup(selected.id, selected.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !assemblyId) return
    setResult(null)
    setError(null)
    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as AssemblyBackup
        if (parsed.format_version !== 1 || !Array.isArray(parsed.booths)) {
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
          ta="மீட்பு என்பது இணைத்தல் (merge) — ஏற்கனவே உள்ள தரவை மேலெழுதாது, மேலும் தரவைச் சேர்க்கும்/புதுப்பிக்கும்."
          en="Restore merges into existing data (upsert) — it never wipes the assembly first."
        />
      </p>
      <div className="toolbar">
        <select value={assemblyId} onChange={(e) => setAssemblyId(e.target.value)}>
          <option value="">{t('தொகுதியைத் தேர்ந்தெடு', 'Select an assembly')}</option>
          {assemblies.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button className="btn small secondary" disabled={!selected || exporting} onClick={() => void onDownload()}>
          {exporting ? '…' : t('காப்பு பதிவிறக்கு', 'Download backup')}
        </button>
        <button className="btn small secondary" disabled={!selected || restore.isPending} onClick={() => fileRef.current?.click()}>
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
