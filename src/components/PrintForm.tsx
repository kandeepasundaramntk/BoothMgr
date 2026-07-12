/* eslint-disable react-refresh/only-export-components */
import { ACTIONS } from '../data/actionsCatalog'
import type { BoothSection } from '../data/boothSections'
import { matchesTeam, TEAM_LABEL, type BoothFieldKey, type Team, type TeamFilter } from '../data/teams'
import type { ActionStatus, BoothDetail } from '../types'

/**
 * The printable booth form (layout carried over from booth-form.html),
 * grouped by owning team like the paper forms. Always Tamil-primary — it's a
 * paper artifact for field workers, independent of the UI language toggle.
 * `blank` renders writing lines instead of data for hand-filling.
 * `sections`/`teamFilter` let the caller print only a subset — matching the
 * editor's 4 tabs and the Assembly POC / IT Wing category filter.
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

// Which of the editor's 4 tabs each field belongs to — the structured
// (table-like) fields are "Votes & social", the free-text ones "Issues & notes".
const FIELD_SECTION: Record<BoothFieldKey, Extract<BoothSection, 'votes' | 'issues'>> = {
  party_votes: 'votes',
  castes: 'votes',
  religions: 'votes',
  influencers: 'votes',
  macro_trends: 'issues',
  long_pending_issues: 'issues',
  alliance_dynamics: 'issues',
  candidate_selection: 'issues',
  media_narrative: 'issues',
  anti_incumbency: 'issues',
  beneficiary_mapping: 'issues',
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

const FIELD_HEADING = (electionName: string): Partial<Record<BoothFieldKey, string>> => ({
  party_votes: `கட்சி வாரியாக பதிவான வாக்குகள்${electionName ? ` — ${electionName}` : ''} (Polled votes, party wise)`,
  castes: 'சாதி விகிதம் (% of Caste)',
  religions: 'மத விகிதம் (% of Religion)',
  influencers: 'உள்ளூர் செல்வாக்குள்ளவர்கள் — பெயர் & தொடர்பு (Micro-Influencers, name & contact)',
})

function PrintField({
  d,
  field,
  blank,
  electionName,
}: {
  d: BoothDetail
  field: BoothFieldKey
  blank: boolean
  electionName: string
}) {
  const structuredHeading = FIELD_HEADING(electionName)[field]
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
      {blank ? <BlankLines count={5} /> : <p style={{ whiteSpace: 'pre-wrap' }}>{d.booth[freeTextKey] || '—'}</p>}
    </div>
  )
}

const ALL_SECTIONS: ReadonlySet<BoothSection> = new Set(['basic', 'votes', 'issues', 'actions'])

export default function PrintForm({
  assemblyName,
  electionName = '',
  detail,
  blank,
  sections = ALL_SECTIONS,
  teamFilter = 'all',
}: {
  assemblyName: string
  /** Active election's name, shown in the print title and party-votes heading. */
  electionName?: string
  detail: BoothDetail
  blank: boolean
  /** Which of the editor's 4 tabs to include; defaults to all of them. */
  sections?: ReadonlySet<BoothSection>
  /** Category filter — Assembly POC / IT Wing / All ('both'-tagged content always shows). */
  teamFilter?: TeamFilter
}) {
  const d = detail
  const line = (value: string) => value || '________________'
  // The identifying header (assembly/booth/village/date) always prints —
  // it's the only way to tell which booth a page belongs to.
  const teams = (['poc', 'itw', 'both'] as const).filter((team) => matchesTeam(team, teamFilter))

  return (
    <>
      <header style={{ textAlign: 'center', borderBottom: '3px double #333', paddingBottom: 10, marginBottom: 14 }}>
        <h1 style={{ fontSize: 19 }}>பூத் மட்ட விவரப் படிவம்{electionName ? ` — ${electionName}` : ''}</h1>
        <h2 style={{ fontSize: 14, fontWeight: 'normal', color: '#444' }}>
          Booth Level Detail Form{electionName ? ` (${electionName})` : ''}
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

      {teams.map((team) => {
        const fields = GROUP_FIELDS[team].filter((field) => sections.has(FIELD_SECTION[field]))
        const actions = sections.has('actions') ? ACTIONS.filter((a) => a.team === team) : []
        if (fields.length === 0 && actions.length === 0) return null
        return (
          <section key={team}>
            <h3 className="section">
              {TEAM_LABEL[team].ta} ({TEAM_LABEL[team].en})
            </h3>

            {fields.map((field) => (
              <PrintField key={field} d={d} field={field} blank={blank} electionName={electionName} />
            ))}

            {actions.map((action) => {
              const st = d.actions.find((a) => a.action_id === action.id)
              const status = st?.status ?? 'not_started'
              return (
                <div className="action-item" key={action.id}>
                  <div className="title-row">
                    <span className="num">{action.id}.</span>
                    <span className="title">
                      {action.title_ta} <span className="en">({action.title_en})</span>
                    </span>
                  </div>
                  <div className="status-row">
                    {(['not_started', 'in_progress', 'done'] as const).map((s) => (
                      <span key={s}>
                        <span className={`cb${!blank && status === s ? ' checked' : ''}`} />
                        {STATUS_TA[s]}
                      </span>
                    ))}
                  </div>
                  {action.id === 10 && !blank && d.booth.committed_pct !== null && (
                    <div className="hint">
                      Committed {d.booth.committed_pct}% · Swing {d.booth.swing_pct ?? '—'}% · Opponent{' '}
                      {d.booth.opponent_pct ?? '—'}%
                    </div>
                  )}
                  {action.id === 10 && blank && (
                    <div className="hint">Committed ____% · Swing ____% · Opponent ____%</div>
                  )}
                  {blank ? (
                    <BlankLines count={5} />
                  ) : (
                    <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{st?.notes || '—'}</p>
                  )}
                </div>
              )
            })}
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
