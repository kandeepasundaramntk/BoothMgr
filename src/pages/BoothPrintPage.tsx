import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ACTIONS } from '../data/actionsCatalog'
import { getApi } from '../data/api'
import { TEAM_LABEL, type BoothFieldKey, type Team } from '../data/teams'
import type { ActionStatus, BoothDetail } from '../types'

// Print layout carried over from booth-form.html, filled with the booth's
// data and grouped by owning team like the paper forms.
const STATUS_TA: Record<ActionStatus, string> = {
  not_started: 'தொடங்கப்படவில்லை',
  in_progress: 'நடைபெறுகிறது',
  done: 'முடிந்தது',
}

const FREE_TEXT_LABEL: Partial<Record<BoothFieldKey, [string, string]>> = {
  macro_trends: ['முக்கியப் பிரச்சனைகள் / சமூகப் பொருளாதாரப் போக்குகள்', 'Macro Socioeconomic Trends'],
  long_pending_issues: ['நீண்டகாலமாகத் தீர்க்கப்படாத பிரச்சனைகள்', 'Long Pending Issues'],
  alliance_dynamics: ['கூட்டணி மற்றும் வாக்குப்பிரிப்பு', 'Alliance Dynamics & Vote Splitters'],
  candidate_selection: ['வேட்பாளர் தேர்வு', 'Candidate Selection'],
  media_narrative: ['ஊடக மேலாண்மை', 'Media Narrative'],
  anti_incumbency: ['அரசு எதிர்ப்பு அலை', 'Anti-Incumbency'],
  beneficiary_mapping: ['பயனாளிகள் கணக்கெடுப்பு', 'Beneficiary Mapping'],
}

// Fields in each team group, preserving the entry form's relative order.
const GROUP_FIELDS: Record<Team, BoothFieldKey[]> = {
  poc: ['castes', 'religions', 'influencers', 'macro_trends', 'long_pending_issues', 'candidate_selection', 'beneficiary_mapping'],
  itw: ['party_votes', 'media_narrative'],
  both: ['alliance_dynamics', 'anti_incumbency'],
}

function PrintField({ d, field }: { d: BoothDetail; field: BoothFieldKey }) {
  if (field === 'party_votes') {
    return (
      <div className="field">
        <label>கட்சி வாரியாக பதிவான வாக்குகள் — 2026 (Polled votes, party wise)</label>
        {d.partyVotes.length === 0 ? (
          <p className="hint">—</p>
        ) : (
          <p>{d.partyVotes.map((v) => `${v.party_name}: ${v.votes}`).join(' · ')}</p>
        )}
      </div>
    )
  }
  if (field === 'castes') {
    return (
      <div className="field">
        <label>சாதி விகிதம் (% of Caste)</label>
        <p>{d.castes.length ? d.castes.map((c) => `${c.caste_name}: ${c.pct}%`).join(' · ') : '—'}</p>
      </div>
    )
  }
  if (field === 'religions') {
    return (
      <div className="field">
        <label>மத விகிதம் (% of Religion)</label>
        <p>{d.religions.length ? d.religions.map((r) => `${r.religion_name}: ${r.pct}%`).join(' · ') : '—'}</p>
      </div>
    )
  }
  if (field === 'influencers') {
    return (
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
    )
  }
  const [ta, en] = FREE_TEXT_LABEL[field]!
  return (
    <div className="field">
      <label>
        {ta} <span className="en">({en})</span>
      </label>
      <p style={{ whiteSpace: 'pre-wrap' }}>{d.booth[field] || '—'}</p>
    </div>
  )
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

      {(['poc', 'itw', 'both'] as const).map((team) => {
        const actions = ACTIONS.filter((a) => a.team === team)
        return (
          <section key={team}>
            <h3 className="section">
              {TEAM_LABEL[team].ta} ({TEAM_LABEL[team].en})
            </h3>

            {GROUP_FIELDS[team].map((field) => (
              <PrintField key={field} d={d} field={field} />
            ))}

            <table className="data" style={{ marginBottom: 14 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>செயல்பாடு (Action)</th>
                  <th>நிலை (Status)</th>
                  <th>குறிப்புகள் (Notes)</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((action) => {
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
          </section>
        )
      })}

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
