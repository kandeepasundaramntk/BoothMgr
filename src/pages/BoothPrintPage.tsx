import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PrintForm from '../components/PrintForm'
import { TeamChips } from '../components/TeamBadge'
import { getApi } from '../data/api'
import { BOOTH_SECTIONS, type BoothSection } from '../data/boothSections'
import type { TeamFilter } from '../data/teams'
import { useActiveElection } from '../election/ElectionContext'
import { L, useT } from '../i18n'

// "Basic details" has no separate print content — the identifying header
// (assembly/booth/village/date) always prints, so only offer the 3 sections
// that actually add or remove content.
const CONTENT_SECTIONS = BOOTH_SECTIONS.filter((s) => s.key !== 'basic')

export default function BoothPrintPage() {
  const { boothId } = useParams<{ boothId: string }>()
  const t = useT()
  const [blank, setBlank] = useState(false)
  const [sections, setSections] = useState<Set<BoothSection>>(() => new Set(BOOTH_SECTIONS.map((s) => s.key)))
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all')
  const { activeElection } = useActiveElection()
  const detail = useQuery({
    queryKey: ['booth', boothId],
    queryFn: async () => (await getApi()).getBoothDetail(boothId!),
    enabled: Boolean(boothId),
  })
  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })

  if (detail.isLoading) return <div className="card">Loading…</div>
  if (detail.isError || !detail.data) return <div className="card error">{String(detail.error)}</div>

  const d = detail.data
  const assemblyName = assemblies.data?.find((a) => a.id === d.booth.assembly_id)?.name ?? ''

  function toggleSection(key: BoothSection) {
    setSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="toolbar no-print">
        <Link to={`/booth/${boothId}`}>← {t('திரும்பு', 'Back')}</Link>
        <span className="grow" />
        <button className="btn small secondary" aria-pressed={blank} onClick={() => setBlank((v) => !v)}>
          {blank ? t('தரவுகளுடன் காட்டு', 'Show data') : t('வெற்றுப் படிவம்', 'Blank form')}
        </button>
        <button className="btn" onClick={() => window.print()}>
          🖨️ {t('அச்சிடுக', 'Print')}
        </button>
      </div>

      <div className="print-customize no-print">
        <div className="print-customize-row">
          <span className="hint">{t('அச்சிடும் பிரிவுகள்', 'Sections to print')}:</span>
          {CONTENT_SECTIONS.map((s) => (
            <label key={s.key} className="checkbox-chip">
              <input type="checkbox" checked={sections.has(s.key)} onChange={() => toggleSection(s.key)} />
              <L ta={s.ta} en={s.en} />
            </label>
          ))}
        </div>
        <div className="print-customize-row">
          <span className="hint">{t('பிரிவு', 'Category')}:</span>
          <TeamChips value={teamFilter} onChange={setTeamFilter} />
        </div>
      </div>

      <PrintForm
        assemblyName={assemblyName}
        electionName={activeElection?.name ?? ''}
        detail={d}
        blank={blank}
        sections={sections}
        teamFilter={teamFilter}
      />
    </div>
  )
}
