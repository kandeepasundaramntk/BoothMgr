import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ACTIONS } from '../data/actionsCatalog'
import { getApi } from '../data/api'
import type { ActionStatus } from '../types'

// Print layout carried over from booth-form.html, filled with the booth's data.
const STATUS_TA: Record<ActionStatus, string> = {
  not_started: 'தொடங்கப்படவில்லை',
  in_progress: 'நடைபெறுகிறது',
  done: 'முடிந்தது',
}

export default function BoothPrintPage() {
  const { boothId } = useParams<{ boothId: string }>()
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

  const freeText: [string, string, string][] = [
    ['முக்கியப் பிரச்சனைகள் / சமூகப் பொருளாதாரப் போக்குகள்', 'Macro Socioeconomic Trends', d.booth.macro_trends],
    ['கூட்டணி மற்றும் வாக்குப்பிரிப்பு', 'Alliance Dynamics & Vote Splitters', d.booth.alliance_dynamics],
    ['வேட்பாளர் தேர்வு', 'Candidate Selection', d.booth.candidate_selection],
    ['ஊடக மேலாண்மை', 'Media Narrative', d.booth.media_narrative],
    ['அரசு எதிர்ப்பு அலை', 'Anti-Incumbency', d.booth.anti_incumbency],
    ['பயனாளிகள் கணக்கெடுப்பு', 'Beneficiary Mapping', d.booth.beneficiary_mapping],
  ]

  return (
    <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="toolbar no-print">
        <Link to={`/booth/${boothId}`}>← திரும்பு / Back</Link>
        <span className="grow" />
        <button className="btn" onClick={() => window.print()}>
          🖨️ அச்சிடுக / Print
        </button>
      </div>

      <header style={{ textAlign: 'center', borderBottom: '3px double #333', paddingBottom: 10, marginBottom: 14 }}>
        <h1 style={{ fontSize: 19 }}>இடைத்தேர்தல் — பூத் மட்ட விவரப் படிவம்</h1>
        <h2 style={{ fontSize: 14, fontWeight: 'normal', color: '#444' }}>
          By-Election — Booth Level Detail Form (2026)
        </h2>
      </header>

      <div className="two-col" style={{ marginBottom: 12 }}>
        <p>
          <strong>சட்டமன்றத் தொகுதி / Assembly:</strong> {assemblyName}
        </p>
        <p>
          <strong>வாக்குச்சாவடி எண் / Booth No:</strong> {d.booth.booth_number}
        </p>
        <p>
          <strong>கிராமம் / வார்டு / பகுதி:</strong> {d.booth.village_ward_area}
        </p>
        <p>
          <strong>தேதி / Date:</strong> {new Date().toLocaleDateString('ta-IN')}
        </p>
      </div>

      <h3 className="section">பகுதி 1 — பூத் மட்ட விவரங்கள் | Booth Level Details</h3>

      <div className="field">
        <label>கட்சி வாரியாக பதிவான வாக்குகள் — 2026 (Polled votes, party wise)</label>
        {d.partyVotes.length === 0 ? (
          <p className="hint">—</p>
        ) : (
          <p>{d.partyVotes.map((v) => `${v.party_name}: ${v.votes}`).join(' · ')}</p>
        )}
      </div>

      <div className="two-col">
        <div className="field">
          <label>சாதி விகிதம் (% of Caste)</label>
          <p>{d.castes.length ? d.castes.map((c) => `${c.caste_name}: ${c.pct}%`).join(' · ') : '—'}</p>
        </div>
        <div className="field">
          <label>மத விகிதம் (% of Religion)</label>
          <p>{d.religions.length ? d.religions.map((r) => `${r.religion_name}: ${r.pct}%`).join(' · ') : '—'}</p>
        </div>
      </div>

      <div className="field">
        <label>உள்ளூர் செல்வாக்குள்ளவர்கள் (Micro-Influencers)</label>
        {d.influencers.length === 0 ? (
          <p className="hint">—</p>
        ) : (
          <ul style={{ paddingLeft: 20 }}>
            {d.influencers.map((f, i) => (
              <li key={i}>{[f.name, f.contact, f.role_note].filter(Boolean).join(' – ')}</li>
            ))}
          </ul>
        )}
      </div>

      {freeText.map(([ta, en, value]) => (
        <div className="field" key={en}>
          <label>
            {ta} <span className="en">({en})</span>
          </label>
          <p style={{ whiteSpace: 'pre-wrap' }}>{value || '—'}</p>
        </div>
      ))}

      <h3 className="section">பகுதி 2 — பூத் மட்டச் செயல்பாடுகள் | Booth Level Actions</h3>

      <table className="data">
        <thead>
          <tr>
            <th>#</th>
            <th>செயல்பாடு (Action)</th>
            <th>நிலை (Status)</th>
            <th>குறிப்புகள் (Notes)</th>
          </tr>
        </thead>
        <tbody>
          {ACTIONS.map((action) => {
            const st = d.actions.find((a) => a.action_id === action.id)
            const status = st?.status ?? 'not_started'
            return (
              <tr key={action.id}>
                <td>{action.id}</td>
                <td>
                  {action.title_ta} <span className="en">({action.title_en})</span>
                  {action.id === 10 && d.booth.committed_pct !== null && (
                    <div className="hint">
                      Committed {d.booth.committed_pct}% · Swing {d.booth.swing_pct ?? '—'}% · Opponent{' '}
                      {d.booth.opponent_pct ?? '—'}%
                    </div>
                  )}
                </td>
                <td>{STATUS_TA[status]}</td>
                <td>{st?.notes || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <footer
        style={{
          marginTop: 32,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 40,
        }}
      >
        <div style={{ textAlign: 'center', paddingTop: 34, borderTop: '1px solid #333', fontSize: 12 }}>
          பூத் பொறுப்பாளர் கையொப்பம்
          <br />
          Booth In-charge Signature
        </div>
        <div style={{ textAlign: 'center', paddingTop: 34, borderTop: '1px solid #333', fontSize: 12 }}>
          தொகுதி ஒருங்கிணைப்பாளர் கையொப்பம்
          <br />
          Assembly Coordinator Signature
        </div>
      </footer>
    </div>
  )
}
