import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ACTIONS, TOTAL_ACTIONS } from '../data/actionsCatalog'
import { getApi } from '../data/api'
import { healthColor, healthLabel } from '../utils/health'

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

export default function DashboardPage() {
  const { assemblyId } = useParams<{ assemblyId: string }>()
  const navigate = useNavigate()

  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })
  const assembly = assemblies.data?.find((a) => a.id === assemblyId)

  const summary = useQuery({
    queryKey: ['summary', assemblyId],
    queryFn: async () => (await getApi()).getAssemblySummary(assemblyId!),
    enabled: Boolean(assemblyId),
  })
  const weakest = useQuery({
    queryKey: ['weakest', assemblyId],
    queryFn: async () => (await getApi()).getWeakestBooths(assemblyId!, 10),
    enabled: Boolean(assemblyId),
  })
  const progress = useQuery({
    queryKey: ['actionProgress', assemblyId],
    queryFn: async () => (await getApi()).getActionProgress(assemblyId!),
    enabled: Boolean(assemblyId),
  })

  const err = summary.error ?? weakest.error ?? progress.error
  const boothCount = summary.data?.booth_count ?? 0

  return (
    <div>
      <div className="toolbar">
        <Link to={`/assembly/${assemblyId}`}>← வாக்குச்சாவடிகள் / Booths</Link>
      </div>
      <h2 className="page-title">
        {assembly?.name ?? '…'} — டாஷ்போர்டு <span className="en">(Dashboard)</span>
      </h2>
      {err != null && <div className="error">{String(err)}</div>}

      <div className="dash-tiles">
        <div className="tile">
          <div className="label">
            வாக்குச்சாவடிகள் <span className="en">(Booths)</span>
          </div>
          <div className="value">{boothCount}</div>
        </div>
        <div className="tile">
          <div className="label">
            சராசரி ஆதரவு <span className="en">(Avg committed)</span>
          </div>
          <div className="value" style={{ color: COLOR_DONE }}>
            {fmtPct(summary.data?.avg_committed_pct ?? null)}
          </div>
        </div>
        <div className="tile">
          <div className="label">
            சராசரி நடுநிலை <span className="en">(Avg swing)</span>
          </div>
          <div className="value" style={{ color: '#8a6d00' }}>
            {fmtPct(summary.data?.avg_swing_pct ?? null)}
          </div>
        </div>
        <div className="tile">
          <div className="label">
            சராசரி எதிர்ப்பு <span className="en">(Avg opponent)</span>
          </div>
          <div className="value" style={{ color: 'var(--accent)' }}>
            {fmtPct(summary.data?.avg_opponent_pct ?? null)}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>
          கவனம் தேவைப்படும் வாக்குச்சாவடிகள் <span className="en">(Weakest booths — lowest committed %)</span>
        </h3>
        {weakest.data && weakest.data.length === 0 && (
          <p className="hint">
            ஆரோக்கிய மதிப்பெண் பதிவிடப்படவில்லை. (No booth health scores recorded yet — set Committed/Swing/Opponent
            % on action 10 of each booth.)
          </p>
        )}
        {weakest.data && weakest.data.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>எண் (No.)</th>
                <th>கிராமம் / பகுதி (Village)</th>
                <th>ஆதரவு % (Committed)</th>
                <th>முன்னேற்றம் (Progress)</th>
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
          செயல்பாடுகளின் முன்னேற்றம் <span className="en">(Action progress across {boothCount} booths)</span>
        </h3>
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
            முடிந்தது (Done)
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
            நடைபெறுகிறது (In progress)
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
            தொடங்கப்படவில்லை (Not started)
          </span>
        </div>
        {progress.data && (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>செயல்பாடு (Action)</th>
                <th>நிலை (Status)</th>
                <th style={{ width: 170 }}>எண்ணிக்கை (Counts)</th>
              </tr>
            </thead>
            <tbody>
              {progress.data.map((row) => {
                const action = ACTIONS.find((a) => a.id === row.action_id)
                return (
                  <tr key={row.action_id}>
                    <td>
                      <strong>{row.action_id}.</strong> {action?.title_ta}{' '}
                      <span className="en">({action?.title_en})</span>
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
