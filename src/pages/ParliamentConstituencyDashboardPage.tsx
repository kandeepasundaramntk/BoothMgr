import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getApi } from '../data/api'
import { useActiveElection } from '../election/ElectionContext'
import { L, useT } from '../i18n'

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)}%`
}

export default function ParliamentConstituencyDashboardPage() {
  const { pcId } = useParams<{ pcId: string }>()
  const t = useT()
  const { activeElectionId } = useActiveElection()

  const pcs = useQuery({
    queryKey: ['parliament-constituencies'],
    queryFn: async () => (await getApi()).listParliamentConstituencies(),
  })
  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })
  const summary = useQuery({
    queryKey: ['pcSummary', pcId, activeElectionId],
    queryFn: async () => (await getApi()).getPcSummary(pcId!, activeElectionId!),
    enabled: Boolean(pcId) && Boolean(activeElectionId),
  })

  const pc = pcs.data?.find((p) => p.id === pcId)
  const memberAssemblies = assemblies.data?.filter((a) => a.parliament_constituency_id === pcId) ?? []

  return (
    <div className="card">
      <div className="toolbar">
        <Link to="/parliament-constituencies">← {t('நாடாளுமன்றத் தொகுதிகள்', 'Parliament Constituencies')}</Link>
      </div>
      {pcs.isLoading && <p>Loading…</p>}
      {pcs.isError && <div className="error">{String(pcs.error)}</div>}
      {pcs.data && !pc && (
        <p className="hint">
          <L ta="இந்த நாடாளுமன்றத் தொகுதி கிடைக்கவில்லை." en="This parliament constituency was not found." />
        </p>
      )}
      {pc && (
        <>
          <h2 className="page-title">{pc.name}</h2>
          {!activeElectionId && (
            <p className="hint">
              <L ta="தேர்தலைத் தேர்ந்தெடுக்கவும்" en="Select an election first" />
            </p>
          )}
          {activeElectionId && (
            <>
              {summary.isLoading && <p>Loading…</p>}
              {summary.isError && <div className="error">{String(summary.error)}</div>}
              {summary.data && (
                <div className="dash-tiles">
                  <div className="tile">
                    <div className="label">
                      <L ta="சட்டமன்றத் தொகுதிகள்" en="Assemblies" />
                    </div>
                    <div className="value">{summary.data.assembly_count}</div>
                  </div>
                  <div className="tile">
                    <div className="label">
                      <L ta="வாக்குச்சாவடிகள்" en="Booths" />
                    </div>
                    <div className="value">{summary.data.booth_count}</div>
                  </div>
                  <div className="tile">
                    <div className="label">
                      <L ta="சராசரி ஆதரவு" en="Avg committed" />
                    </div>
                    <div className="value">{fmtPct(summary.data.avg_committed_pct)}</div>
                  </div>
                  <div className="tile">
                    <div className="label">
                      <L ta="சராசரி நடுநிலை" en="Avg swing" />
                    </div>
                    <div className="value">{fmtPct(summary.data.avg_swing_pct)}</div>
                  </div>
                  <div className="tile">
                    <div className="label">
                      <L ta="சராசரி எதிர்ப்பு" en="Avg opponent" />
                    </div>
                    <div className="value">{fmtPct(summary.data.avg_opponent_pct)}</div>
                  </div>
                </div>
              )}
            </>
          )}
          <h3>
            <L ta="உறுப்பினர் சட்டமன்றத் தொகுதிகள்" en="Member Assemblies" />
          </h3>
          {assemblies.isLoading && <p>Loading…</p>}
          {assemblies.isError && <div className="error">{String(assemblies.error)}</div>}
          {memberAssemblies.length === 0 && !assemblies.isLoading && (
            <p className="hint">
              <L
                ta="இந்த நாடாளுமன்றத் தொகுதியில் சட்டமன்றத் தொகுதிகள் எதுவும் இணைக்கப்படவில்லை."
                en="No assemblies are linked to this parliament constituency yet."
              />
            </p>
          )}
          {memberAssemblies.length > 0 && (
            <table className="data">
              <thead>
                <tr>
                  <th>
                    <L ta="தொகுதி" en="Assembly" />
                  </th>
                  <th>
                    <L ta="மாவட்டம்" en="District" />
                  </th>
                  <th style={{ width: 140 }}></th>
                </tr>
              </thead>
              <tbody>
                {memberAssemblies.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.district}</td>
                    <td>
                      <Link className="btn small secondary" to={`/assembly/${a.id}`}>
                        {t('காண்க', 'View')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
