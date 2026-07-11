import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getApi } from '../data/api'
import { L, useT } from '../i18n'

export default function ParliamentConstituencyDashboardPage() {
  const { pcId } = useParams<{ pcId: string }>()
  const t = useT()

  const pcs = useQuery({
    queryKey: ['parliament-constituencies'],
    queryFn: async () => (await getApi()).listParliamentConstituencies(),
  })
  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
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
          <p className="hint">
            <L
              ta="தேர்தல்-நோக்கு டாஷ்போர்டுகள் இணைக்கப்பட்டதும் ஒட்டுமொத்த ஆரோக்கிய சுருக்கம் (சராசரி commited/swing/opponent %) இங்கு தோன்றும்."
              en="Aggregate health rollup will appear here once election-scoped dashboards are wired up."
            />
          </p>
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
