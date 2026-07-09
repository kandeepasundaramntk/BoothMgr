import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Papa from 'papaparse'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TOTAL_ACTIONS } from '../data/actionsCatalog'
import { getApi } from '../data/api'
import type { BoothImportRow } from '../types'
import { exportAssemblyCsv } from '../utils/exportCsv'
import { L, useT } from '../i18n'
import { generateTeamForms, type FormTeam } from '../utils/generateForms'
import { healthColor, healthLabel } from '../utils/health'

export default function BoothListPage() {
  const { assemblyId } = useParams<{ assemblyId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newNumber, setNewNumber] = useState('')
  const [newVillage, setNewVillage] = useState('')
  const [exporting, setExporting] = useState(false)
  // form generation: booths are all selected by default, so track UN-selection
  const [unselected, setUnselected] = useState<Set<string>>(new Set())
  const [showForms, setShowForms] = useState(false)
  const [formTeams, setFormTeams] = useState<Record<FormTeam, boolean>>({ poc: true, itw: true })
  const [prefilled, setPrefilled] = useState(false)
  const [generating, setGenerating] = useState(false)

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

  const selectedCount = (booths.data ?? []).filter((b) => !unselected.has(b.id)).length
  const selectedTeams: FormTeam[] = (['poc', 'itw'] as const).filter((t) => formTeams[t])

  function toggleBooth(id: string) {
    setUnselected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setUnselected((prev) => (prev.size === 0 ? new Set((booths.data ?? []).map((b) => b.id)) : new Set()))
  }

  async function onGenerateForms() {
    if (selectedCount === 0 || selectedTeams.length === 0) return
    setGenerating(true)
    setError(null)
    try {
      const api = await getApi()
      const details = (await api.getAssemblyExport(assemblyId!)).filter((d) => !unselected.has(d.booth.id))
      await generateTeamForms({
        assemblyName: assembly?.name ?? 'assembly',
        details,
        teams: selectedTeams,
        prefilled,
      })
      setMessage(`${details.length} வாக்குச்சாவடிகளுக்கு ${selectedTeams.length} கோப்பு(கள்) உருவாக்கப்பட்டன (form files generated)`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="card">
      <h2 className="page-title">
        {assembly?.name ?? '…'} — <L ta="வாக்குச்சாவடிகள்" en="Booths" />
      </h2>

      <div className="toolbar">
        <input
          placeholder={t('தேடு: எண் / கிராமம்', 'search booth no. or village', ' — ')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <span className="grow" />
        <Link className="btn small secondary" to={`/assembly/${assemblyId}/dashboard`}>
          {t('டாஷ்போர்டு', 'Dashboard')}
        </Link>
        <button className="btn small secondary" onClick={() => setShowForms((v) => !v)}>
          {t('படிவங்கள்', 'Forms')}
        </button>
        <button className="btn small secondary" onClick={() => void onExport()} disabled={exporting}>
          {exporting ? '…' : t('CSV பதிவிறக்கு', 'Export')}
        </button>
        <button className="btn small" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}>
          {t('CSV இறக்குமதி', 'Import')}
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onCsvChosen} />
      </div>
      <p className="hint" style={{ marginBottom: 10 }}>
        CSV headers: <code>Booth Number</code>, <code>Village / Ward / Area</code>
      </p>

      {showForms && (
        <div className="forms-panel">
          <strong>
            <L ta="படிவங்கள் உருவாக்கு" en="Generate booth forms" />
          </strong>
          <div className="toolbar" style={{ margin: '8px 0 0' }}>
            <span>
              <L ta="அணி" en="Team" />:
            </span>
            {(['poc', 'itw'] as const).map((team) => (
              <label key={team}>
                <input
                  type="checkbox"
                  checked={formTeams[team]}
                  onChange={(e) => setFormTeams((prev) => ({ ...prev, [team]: e.target.checked }))}
                />{' '}
                {team === 'poc' ? (
                  <L ta="தொகுதி பொறுப்பாளர்" en="Assembly POC" />
                ) : (
                  <L ta="இணையக் குழு" en="IT Wing" />
                )}
              </label>
            ))}
          </div>
          <div className="toolbar" style={{ margin: '6px 0 0' }}>
            <span>
              <L ta="உள்ளடக்கம்" en="Content" />:
            </span>
            <label>
              <input type="radio" name="form-content" checked={!prefilled} onChange={() => setPrefilled(false)} />{' '}
              <L ta="வெற்றுப் படிவம்" en="blank" />
            </label>
            <label>
              <input type="radio" name="form-content" checked={prefilled} onChange={() => setPrefilled(true)} />{' '}
              <L ta="பதிவிட்ட தரவுகளுடன்" en="pre-filled" />
            </label>
          </div>
          <div className="toolbar" style={{ margin: '8px 0 0' }}>
            <button
              className="btn small"
              onClick={() => void onGenerateForms()}
              disabled={generating || selectedCount === 0 || selectedTeams.length === 0}
            >
              {generating ? '…' : `${t('உருவாக்கு', 'Generate')} (${selectedCount} booths)`}
            </button>
            <span className="hint">
              <L ta="ஒரு அணிக்கு ஒரு Word கோப்பு; ஒரு பூத்துக்கு ஒரு பக்கம்." en="One .docx per team, one page per booth." />
            </span>
          </div>
        </div>
      )}

      {message && <p className="hint" style={{ color: 'var(--ok)', marginBottom: 8 }}>{message}</p>}
      {error && <div className="error">{error}</div>}
      {booths.isLoading && <p>Loading…</p>}
      {booths.isError && <div className="error">{String(booths.error)}</div>}

      {booths.data && booths.data.length === 0 && (
        <p className="hint">
          <L
            ta="வாக்குச்சாவடிகள் இல்லை — CSV மூலம் இறக்குமதி செய்யவும் அல்லது கீழே சேர்க்கவும்."
            en="No booths yet — import a CSV or add one below."
          />
        </p>
      )}

      {filtered.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 30 }}>
                <input
                  type="checkbox"
                  aria-label="அனைத்தையும் தேர்வுசெய் (select all booths)"
                  checked={unselected.size === 0}
                  onChange={toggleAll}
                />
              </th>
              <th>
                <L ta="எண்" en="No." />
              </th>
              <th>
                <L ta="கிராமம் / வார்டு / பகுதி" en="Village / Ward / Area" />
              </th>
              <th>
                <L ta="முன்னேற்றம்" en="Progress" />
              </th>
              <th>
                <L ta="ஆரோக்கியம்" en="Health" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} className="clickable" onClick={() => navigate(`/booth/${b.id}`)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`பூத் ${b.booth_number} தேர்வு (select booth)`}
                    checked={!unselected.has(b.id)}
                    onChange={() => toggleBooth(b.id)}
                  />
                </td>
                <td>{b.booth_number}</td>
                <td>{b.village_ward_area}</td>
                <td className="health-cell">
                  {b.done_count}/{TOTAL_ACTIONS} {t('முடிந்தது', 'done')}
                  {b.in_progress_count > 0 && (
                    <span className="hint">
                      {' '}
                      · {b.in_progress_count} {t('நடைபெறுகிறது', 'in progress')}
                    </span>
                  )}
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
          placeholder={t('பூத் எண்', 'Booth no.')}
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          style={{ width: 130 }}
        />
        <input
          placeholder={t('கிராமம் / வார்டு', 'Village')}
          value={newVillage}
          onChange={(e) => setNewVillage(e.target.value)}
          style={{ minWidth: 200 }}
        />
        <button className="btn" type="submit" disabled={createMutation.isPending || !newNumber.trim()}>
          {t('பூத் சேர்', 'Add booth')}
        </button>
      </form>
    </div>
  )
}
