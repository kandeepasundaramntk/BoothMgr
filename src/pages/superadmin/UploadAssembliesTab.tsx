import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ChangeEvent } from 'react'
import { getApi } from '../../data/api'
import { L, useT } from '../../i18n'
import type { BulkAssemblyUploadResult, BulkAssemblyUploadRow } from '../../types'

function isValidRows(value: unknown): value is BulkAssemblyUploadRow[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (row) =>
      row &&
      typeof row === 'object' &&
      typeof (row as { name?: unknown }).name === 'string' &&
      ((row as { booths?: unknown }).booths === undefined || Array.isArray((row as { booths?: unknown }).booths)),
  )
}

export default function UploadAssembliesTab() {
  const t = useT()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<BulkAssemblyUploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = useMutation({
    mutationFn: async (rows: BulkAssemblyUploadRow[]) => (await getApi()).bulkCreateAssemblies(rows),
    onSuccess: (r) => {
      setResult(r)
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['assemblies'] })
    },
    onError: (e) => {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    },
  })

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setResult(null)
    setError(null)
    file
      .text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text)
        if (!isValidRows(parsed)) {
          throw new Error(
            t(
              'செல்லுபடியாகாத கோப்பு — [{ "name": "..." , "booths"?: [...] }] என்ற வடிவத்தில் இருக்க வேண்டும்',
              'Invalid file — expected [{ "name": "...", "booths"?: [...] }]',
            ),
          )
        }
        upload.mutate(parsed)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  return (
    <div>
      <p className="hint">
        <L
          ta='JSON வடிவம்: [{ "name": "தொகுதி பெயர்", "booths"?: [{ "booth_number": "...", "village_ward_area": "..." }] }]. ஏற்கனவே உள்ள தொகுதி பெயர்கள் தவிர்க்கப்படும் (skip), ஆனால் அவற்றின் புதிய பூத்கள் சேர்க்கப்படும்.'
          en='JSON format: [{ "name": "Assembly name", "booths"?: [{ "booth_number": "...", "village_ward_area": "..." }] }]. Existing assembly names are skipped, but their new booths are still added.'
        />
      </p>
      <div className="toolbar">
        <button className="btn small secondary" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
          {upload.isPending ? '…' : t('JSON கோப்பைத் தேர்ந்தெடு', 'Choose JSON file')}
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFileChosen} />
      </div>
      {error && <div className="error">{error}</div>}
      {result && (
        <div className="hint">
          {t(
            `உருவாக்கப்பட்டவை: ${result.assemblies_created} தொகுதிகள், ${result.booths_created} பூத்கள். தவிர்க்கப்பட்டவை: ${result.assemblies_skipped.join(', ') || '—'}`,
            `Created: ${result.assemblies_created} assemblies, ${result.booths_created} booths. Skipped (already existed): ${result.assemblies_skipped.join(', ') || '—'}`,
          )}
        </div>
      )}
    </div>
  )
}
