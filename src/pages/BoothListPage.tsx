import { useQuery } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { Tabs, type TabDef } from '../components/Tabs'
import { getApi } from '../data/api'
import { useActiveElection } from '../election/ElectionContext'
import { L } from '../i18n'
import { assemblyLabel } from '../utils/assemblyLabel'
import { BoothsTab } from './assembly/BoothsTab'
import { OverviewTab } from './assembly/OverviewTab'

type AssemblyTab = 'overview' | 'booths'

const TABS: TabDef<AssemblyTab>[] = [
  { key: 'overview', ta: 'கண்ணோட்டம்', en: 'Overview' },
  { key: 'booths', ta: 'வாக்குச்சாவடிகள்', en: 'Booths' },
]

export default function BoothListPage() {
  const { assemblyId } = useParams<{ assemblyId: string }>()
  const { activeElectionId } = useActiveElection()
  const [searchParams, setSearchParams] = useSearchParams()

  const rawTab = searchParams.get('tab')
  const tab: AssemblyTab = rawTab === 'booths' ? 'booths' : 'overview'
  const setTab = (key: AssemblyTab) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })
  const assembly = assemblies.data?.find((a) => a.id === assemblyId)

  if (!activeElectionId) {
    return (
      <div className="card error">
        <L ta="தேர்தலைத் தேர்ந்தெடுக்கவும்" en="Select an election first" />
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="page-title">{assembly ? assemblyLabel(assembly) : '…'}</h2>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'overview' ? (
        <OverviewTab assemblyId={assemblyId!} electionId={activeElectionId} />
      ) : (
        <BoothsTab assemblyId={assemblyId!} electionId={activeElectionId} />
      )}
    </div>
  )
}
