import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TeamBadge, TeamChips } from '../../components/TeamBadge'
import { ACTIONS, TOTAL_ACTIONS } from '../../data/actionsCatalog'
import { getApi } from '../../data/api'
import { matchesTeam, type TeamFilter } from '../../data/teams'
import { L } from '../../i18n'
import { healthColor, healthLabel } from '../../utils/health'

// Status palette (dataviz skill): meaning is never color-alone — every bar row
// prints its counts as text and the legend carries labels.
const COLOR_DONE = '#0ca30c'
const COLOR_IN_PROGRESS = '#fab219'
const COLOR_NOT_STARTED = '#e1e0d9'

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)}%`
}

function StackedBar({ done, inProgress, notStarted }: { done: number; inProgress: number; notStarted: number }) {
  const total = done + inProgress + notStarted
  if (total === 0) return <div className="hint">—</div>
  const seg = (count: number, color: string, label: string) =>
    count > 0 ? (
      <div
        title={`${label}: ${count}`}
        style={{
          flex: count,
          background: color,
          minWidth: 4,
          boxShadow: 'inset 0 0 0 1px rgba(11,11,11,0.10)',
        }}
      />
    ) : null
  return (
    <div style={{ display: 'flex', gap: 2, height: 14, borderRadius: 3, overflow: 'hidden' }}>
      {seg(done, COLOR_DONE, 'முடிந்தது / Done')}
      {seg(inProgress, COLOR_IN_PROGRESS, 'நடைபெறுகிறது / In progress')}
      {seg(notStarted, COLOR_NOT_STARTED, 'தொடங்கப்படவில்லை / Not started')}
    </div>
  )
}

export function OverviewTab({ assemblyId, electionId }: { assemblyId: string; electionId: string }): JSX.Element {
  const navigate = useNavigate()
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all')

  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })
  const assembly = assemblies.data?.find((a) => a.id === assemblyId)

  const parliamentConstituencies = useQuery({
    queryKey: ['parliamentConstituencies'],
    queryFn: async () => (await getApi()).listParliamentConstituencies(),
  })
  const pc = assembly?.parliament_constituency_id
    ? parliamentConstituencies.data?.find((p) => p.id === assembly.parliament_constituency_id)
    : undefined

  const summary = useQuery({
    queryKey: ['summary', assemblyId, electionId],
    queryFn: async () => (await getApi()).getAssemblySummary(assemblyId, electionId),
    enabled: Boolean(assemblyId) && Boolean(electionId),
  })
  const weakest = useQuery({
    queryKey: ['weakest', assemblyId, electionId],
    queryFn: async () => (await getApi()).getWeakestBooths(assemblyId, electionId, 10),
    enabled: Boolean(assemblyId) && Boolean(electionId),
  })
  const progress = useQuery({
    queryKey: ['actionProgress', assemblyId, electionId],
    queryFn: async () => (await getApi()).getActionProgress(assemblyId, electionId),
    enabled: Boolean(assemblyId) && Boolean(electionId),
  })

  const err = summary.error ?? weakest.error ?? progress.error
  const boothCount = summary.data?.booth_count ?? 0

  return (
    <div>
      {assembly && (assembly.district || assembly.constituency_code || assembly.state_code || pc) && (
        <div className="toolbar hint" style={{ gap: 12, marginBottom: 10 }}>
          {assembly.district && (
            <span>
              <L ta="மாவட்டம்" en="District" />: {assembly.district}
            </span>
          )}
          {assembly.constituency_code && (
            <span>
              <L ta="தொகுதி குறியீடு" en="Constituency code" />: {assembly.constituency_code}
            </span>
          )}
          {assembly.state_code && (
            <span>
              <L ta="மாநிலம்" en="State" />: {assembly.state_code}
            </span>
          )}
          {pc && (
            <span>
              <L ta="மக்களவைத் தொகுதி" en="Parliament Constituency" />:{' '}
              <Link to={`/parliament-constituencies/${pc.id}`}>{pc.name}</Link>
            </span>
          )}
        </div>
      )}

      {err != null && <div className="error">{String(err)}</div>}

      <div className="dash-tiles">
        <div className="tile">
          <div className="label">
            <L ta="வாக்குச்சாவடிகள்" en="Booths" />
          </div>
          <div className="value">{boothCount}</div>
        </div>
        <div className="tile">
          <div className="label">
            <L ta="சராசரி ஆதரவு" en="Avg committed" />
          </div>
          <div className="value" style={{ color: COLOR_DONE }}>
            {fmtPct(summary.data?.avg_committed_pct ?? null)}
          </div>
        </div>
        <div className="tile">
          <div className="label">
            <L ta="சராசரி நடுநிலை" en="Avg swing" />
          </div>
          <div className="value" style={{ color: '#8a6d00' }}>
            {fmtPct(summary.data?.avg_swing_pct ?? null)}
          </div>
        </div>
        <div className="tile">
          <div className="label">
            <L ta="சராசரி எதிர்ப்பு" en="Avg opponent" />
          </div>
          <div className="value" style={{ color: 'var(--accent)' }}>
            {fmtPct(summary.data?.avg_opponent_pct ?? null)}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>
          <L ta="கவனம் தேவைப்படும் வாக்குச்சாவடிகள்" en="Weakest booths — lowest committed %" />
        </h3>
        {weakest.data && weakest.data.length === 0 && (
          <p className="hint">
            <L
              ta="ஆரோக்கிய மதிப்பெண் பதிவிடப்படவில்லை."
              en="No booth health scores recorded yet — set Committed/Swing/Opponent % on action 10 of each booth."
            />
          </p>
        )}
        {weakest.data && weakest.data.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>
                  <L ta="எண்" en="No." />
                </th>
                <th>
                  <L ta="கிராமம் / பகுதி" en="Village" />
                </th>
                <th>
                  <L ta="ஆதரவு %" en="Committed" />
                </th>
                <th>
                  <L ta="முன்னேற்றம்" en="Progress" />
                </th>
              </tr>
            </thead>
            <tbody>
              {weakest.data.map((b) => (
                <tr key={b.id} className="clickable" onClick={() => navigate(`/booth/${b.id}`)}>
                  <td>{b.booth_number}</td>
                  <td>{b.village_ward_area}</td>
                  <td>
                    <span className="pill" style={{ background: healthColor(b.committed_pct) }}>
                      {healthLabel(b.committed_pct)}
                    </span>
                  </td>
                  <td className="health-cell">
                    {b.done_count}/{TOTAL_ACTIONS}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>
          <L ta="செயல்பாடுகளின் முன்னேற்றம்" en={`Action progress across ${boothCount} booths`} />
        </h3>
        <TeamChips value={teamFilter} onChange={setTeamFilter} />
        <div className="toolbar" style={{ fontSize: 12, marginBottom: 10 }}>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                background: COLOR_DONE,
                borderRadius: 2,
                marginRight: 4,
                verticalAlign: -1,
              }}
            />
            <L ta="முடிந்தது" en="Done" />
          </span>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                background: COLOR_IN_PROGRESS,
                borderRadius: 2,
                marginRight: 4,
                verticalAlign: -1,
                boxShadow: 'inset 0 0 0 1px rgba(11,11,11,0.10)',
              }}
            />
            <L ta="நடைபெறுகிறது" en="In progress" />
          </span>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                background: COLOR_NOT_STARTED,
                borderRadius: 2,
                marginRight: 4,
                verticalAlign: -1,
                boxShadow: 'inset 0 0 0 1px rgba(11,11,11,0.10)',
              }}
            />
            <L ta="தொடங்கப்படவில்லை" en="Not started" />
          </span>
        </div>
        {progress.data && (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>
                  <L ta="செயல்பாடு" en="Action" />
                </th>
                <th>
                  <L ta="நிலை" en="Status" />
                </th>
                <th style={{ width: 170 }}>
                  <L ta="எண்ணிக்கை" en="Counts" />
                </th>
              </tr>
            </thead>
            <tbody>
              {progress.data
                .filter((row) => {
                  const action = ACTIONS.find((a) => a.id === row.action_id)
                  return !action || matchesTeam(action.team, teamFilter)
                })
                .map((row) => {
                const action = ACTIONS.find((a) => a.id === row.action_id)
                return (
                  <tr key={row.action_id}>
                    <td>
                      <strong>{row.action_id}.</strong>{' '}
                      {action && (
                        <>
                          <L ta={action.title_ta} en={action.title_en} />
                          <TeamBadge team={action.team} />
                        </>
                      )}
                    </td>
                    <td>
                      <StackedBar
                        done={row.done_count}
                        inProgress={row.in_progress_count}
                        notStarted={row.not_started_count}
                      />
                    </td>
                    <td className="health-cell" style={{ fontSize: 12 }}>
                      ✓ {row.done_count} · ⋯ {row.in_progress_count} · ○ {row.not_started_count}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
