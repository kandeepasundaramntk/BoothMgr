/* eslint-disable react-refresh/only-export-components */
import { ACTIONS } from '../data/actionsCatalog'
import { TEAM_LABEL, type BoothFieldKey, type Team } from '../data/teams'
import type { ActionStatus, BoothDetail } from '../types'

/**
 * The printable booth form (layout carried over from booth-form.html),
 * grouped by owning team like the paper forms. Always Tamil-primary — it's a
 * paper artifact for field workers, independent of the UI language toggle.
 * `blank` renders writing lines instead of data for hand-filling.
 */

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

export function emptyBoothDetail(): BoothDetail {
  return {
    booth: {
      id: '',
      assembly_id: '',
      booth_number: '',
      village_ward_area: '',
      committed_pct: null,
      swing_pct: null,
      opponent_pct: null,
      macro_trends: '',
      alliance_dynamics: '',
      candidate_selection: '',
      media_narrative: '',
      anti_incumbency: '',
      beneficiary_mapping: '',
      long_pending_issues: '',
    },
    partyVotes: [],
    castes: [],
    religions: [],
    influencers: [],
    actions: [],
  }
}

function BlankLines({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="blank-line" />
      ))}
    </>
  )
}

const FIELD_HEADING: Partial<Record<BoothFieldKey, string>> = {
  party_votes: 'கட்சி வாரியாக பதிவான வாக்குகள் — 2026 (Polled votes, party wise)',
  castes: 'சாதி விகிதம் (% of Caste)',
  religions: 'மத விகிதம் (% of Religion)',
  influencers: 'உள்ளூர் செல்வாக்குள்ளவர்கள் — பெயர் & தொடர்பு (Micro-Influencers, name & contact)',
}

function PrintField({ d, field, blank }: { d: BoothDetail; field: BoothFieldKey; blank: boolean }) {
  const structuredHeading = FIELD_HEADING[field]
  if (structuredHeading) {
    let filled: React.ReactNode = null
    if (!blank) {
      if (field === 'party_votes') {
        filled = d.partyVotes.length ? (
          <p>{d.partyVotes.map((v) => `${v.party_name}: ${v.votes}`).join(' · ')}</p>
        ) : (
          <p className="hint">—</p>
        )
      } else if (field === 'castes') {
        filled = <p>{d.castes.length ? d.castes.map((c) => `${c.caste_name}: ${c.pct}%`).join(' · ') : '—'}</p>
      } else if (field === 'religions') {
        filled = <p>{d.religions.length ? d.religions.map((r) => `${r.religion_name}: ${r.pct}%`).join(' · ') : '—'}</p>
      } else {
        filled = d.influencers.length ? (
          <ul style={{ paddingLeft: 20 }}>
            {d.influencers.map((f, i) => (
              <li key={i}>{[f.name, f.contact, f.role_note].filter(Boolean).join(' – ')}</li>
            ))}
          </ul>
        ) : (
          <p className="hint">—</p>
        )
      }
    }
    return (
      <div className="field">
        <label>{structuredHeading}</label>
        {blank ? <BlankLines count={3} /> : filled}
      </div>
    )
  }

  const freeTextKey = field as Exclude<BoothFieldKey, 'party_votes' | 'castes' | 'religions' | 'influencers'>
  const [ta, en] = FREE_TEXT_LABEL[freeTextKey]!
  return (
    <div className="field">
      <label>
        {ta} <span className="en">({en})</span>
      </label>
      {blank ? <BlankLines count={3} /> : <p style={{ whiteSpace: 'pre-wrap' }}>{d.booth[freeTextKey] || '—'}</p>}
    </div>
  )
}

export default function PrintForm({
  assemblyName,
  detail,
  blank,
}: {
  assemblyName: string
  detail: BoothDetail
  blank: boolean
}) {
  const d = detail
  const line = (value: string) => value || '________________'

  return (
    <>
      <header style={{ textAlign: 'center', borderBottom: '3px double #333', paddingBottom: 10, marginBottom: 14 }}>
        <h1 style={{ fontSize: 19 }}>இடைத்தேர்தல் — பூத் மட்ட விவரப் படிவம்</h1>
        <h2 style={{ fontSize: 14, fontWeight: 'normal', color: '#444' }}>
          By-Election — Booth Level Detail Form (2026)
        </h2>
      </header>

      <div className="two-col" style={{ marginBottom: 12 }}>
        <p>
          <strong>சட்டமன்றத் தொகுதி / Assembly:</strong> {line(assemblyName)}
        </p>
        <p>
          <strong>வாக்குச்சாவடி எண் / Booth No:</strong> {line(d.booth.booth_number)}
        </p>
        <p>
          <strong>கிராமம் / வார்டு / பகுதி:</strong> {line(d.booth.village_ward_area)}
        </p>
        <p>
          <strong>தேதி / Date:</strong> {blank ? '________________' : new Date().toLocaleDateString('ta-IN')}
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
              <PrintField key={field} d={d} field={field} blank={blank} />
            ))}

            <table className="data" style={{ marginBottom: 14 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>செயல்பாடு (Action)</th>
                  <th style={{ width: 150 }}>நிலை (Status)</th>
                  <th style={{ width: '30%' }}>குறிப்புகள் (Notes)</th>
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
                        {action.id === 10 && !blank && d.booth.committed_pct !== null && (
                          <div className="hint">
                            Committed {d.booth.committed_pct}% · Swing {d.booth.swing_pct ?? '—'}% · Opponent{' '}
                            {d.booth.opponent_pct ?? '—'}%
                          </div>
                        )}
                        {action.id === 10 && blank && (
                          <div className="hint">Committed ____% · Swing ____% · Opponent ____%</div>
                        )}
                      </td>
                      <td>{blank ? '' : STATUS_TA[status]}</td>
                      <td>{blank ? '' : st?.notes || ''}</td>
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
    </>
  )
}
