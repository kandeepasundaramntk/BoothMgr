import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Papa from 'papaparse'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TOTAL_ACTIONS } from '../data/actionsCatalog'
import { getApi } from '../data/api'
import type { BoothImportRow } from '../types'
import { exportAssemblyCsv } from '../utils/exportCsv'
import { healthColor, healthLabel } from '../utils/health'

export default function BoothListPage() {
  const { assemblyId } = useParams<{ assemblyId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newNumber, setNewNumber] = useState('')
  const [newVillage, setNewVillage] = useState('')
  const [exporting, setExporting] = useState(false)

  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })
  const assembly = assemblies.data?.find((a) => a.id === assemblyId)

  const booths = useQuery({
    queryKey: ['booths', assemblyId],
    queryFn: async () => (await getApi()).listBooths(assemblyId!),
    enabled: Boolean(assemblyId),
  })

  const importMutation = useMutation({
    mutationFn: async (rows: BoothImportRow[]) => (await getApi()).importBooths(assemblyId!, rows),
    onSuccess: (added) => {
      setMessage(`${added} வாக்குச்சாவடிகள் சேர்க்கப்பட்டன (booths imported)`)
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['booths', assemblyId] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const createMutation = useMutation({
    mutationFn: async () => (await getApi()).createBooth(assemblyId!, newNumber.trim(), newVillage.trim()),
    onSuccess: (boothId) => navigate(`/booth/${boothId}`),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  function onCsvChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        // Accept the spreadsheet's headers or plain ones; booth number is required.
        const rows: BoothImportRow[] = []
        for (const raw of result.data) {
          const get = (...names: string[]) => {
            for (const n of names) {
              const key = Object.keys(raw).find((k) => k.trim().toLowerCase() === n)
              if (key && raw[key]?.trim()) return raw[key].trim()
            }
            return ''
          }
          const boothNumber = get('booth number', 'booth_number', 'booth no', 'booth')
          if (!boothNumber) continue
          rows.push({
            booth_number: boothNumber,
            village_ward_area: get('village / ward / area', 'village/ward/area', 'village', 'village_ward_area'),
          })
        }
        if (rows.length === 0) {
          setError('CSV-இல் "Booth Number" நெடுவரிசை காணப்படவில்லை (no "Booth Number" column found)')
        } else {
          importMutation.mutate(rows)
        }
        if (fileRef.current) fileRef.current.value = ''
      },
      error: (err) => setError(err.message),
    })
  }

  function onAddBooth(e: FormEvent) {
    e.preventDefault()
    if (newNumber.trim()) createMutation.mutate()
  }

  async function onExport() {
    setExporting(true)
    setError(null)
    try {
      await exportAssemblyCsv(assemblyId!, assembly?.name ?? 'assembly')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  const filtered = (booths.data ?? []).filter(
    (b) =>
      b.booth_number.toLowerCase().includes(search.toLowerCase()) ||
      b.village_ward_area.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="card">
      <h2 className="page-title">
        {assembly?.name ?? '…'} — வாக்குச்சாவடிகள் <span className="en">(Booths)</span>
      </h2>

      <div className="toolbar">
        <input
          placeholder="தேடு: எண் / கிராமம் (search booth no. or village)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <span className="grow" />
        <Link className="btn small secondary" to={`/assembly/${assemblyId}/dashboard`}>
          டாஷ்போர்டு / Dashboard
        </Link>
        <button className="btn small secondary" onClick={() => void onExport()} disabled={exporting}>
          {exporting ? '…' : 'CSV பதிவிறக்கு / Export'}
        </button>
        <button className="btn small" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}>
          CSV இறக்குமதி / Import
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onCsvChosen} />
      </div>
      <p className="hint" style={{ marginBottom: 10 }}>
        CSV headers: <code>Booth Number</code>, <code>Village / Ward / Area</code>
      </p>

      {message && <p className="hint" style={{ color: 'var(--ok)', marginBottom: 8 }}>{message}</p>}
      {error && <div className="error">{error}</div>}
      {booths.isLoading && <p>Loading…</p>}
      {booths.isError && <div className="error">{String(booths.error)}</div>}

      {booths.data && booths.data.length === 0 && (
        <p className="hint">
          வாக்குச்சாவடிகள் இல்லை — CSV மூலம் இறக்குமதி செய்யவும் அல்லது கீழே சேர்க்கவும். (No booths yet — import a CSV
          or add one below.)
        </p>
      )}

      {filtered.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th>
                எண் <span className="en">(No.)</span>
              </th>
              <th>
                கிராமம் / வார்டு / பகுதி <span className="en">(Village / Ward / Area)</span>
              </th>
              <th>
                முன்னேற்றம் <span className="en">(Progress)</span>
              </th>
              <th>
                ஆரோக்கியம் <span className="en">(Health)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} className="clickable" onClick={() => navigate(`/booth/${b.id}`)}>
                <td>{b.booth_number}</td>
                <td>{b.village_ward_area}</td>
                <td className="health-cell">
                  {b.done_count}/{TOTAL_ACTIONS} முடிந்தது
                  {b.in_progress_count > 0 && <span className="hint"> · {b.in_progress_count} நடைபெறுகிறது</span>}
                </td>
                <td>
                  <span className="pill" style={{ background: healthColor(b.committed_pct) }}>
                    {healthLabel(b.committed_pct)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form className="toolbar" style={{ marginTop: 14 }} onSubmit={onAddBooth}>
        <input
          placeholder="பூத் எண் / Booth no."
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          style={{ width: 130 }}
        />
        <input
          placeholder="கிராமம் / வார்டு / Village"
          value={newVillage}
          onChange={(e) => setNewVillage(e.target.value)}
          style={{ minWidth: 200 }}
        />
        <button className="btn" type="submit" disabled={createMutation.isPending || !newNumber.trim()}>
          பூத் சேர் / Add booth
        </button>
      </form>
    </div>
  )
}
