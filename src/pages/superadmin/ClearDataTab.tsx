import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { DangerConfirm } from '../../components/DangerConfirm'
import { getApi } from '../../data/api'
import { useActiveElection } from '../../election/ElectionContext'
import { L, useT } from '../../i18n'
import { assemblyLabel } from '../../utils/assemblyLabel'

export default function ClearDataTab() {
  const t = useT()
  const queryClient = useQueryClient()
  const { activeElectionId } = useActiveElection()
  const [assemblyId, setAssemblyId] = useState('')
  const [electionId, setElectionId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })
  const elections = useQuery({
    queryKey: ['elections'],
    queryFn: async () => (await getApi()).listElections(),
  })
  const selected = assemblies.data?.find((a) => a.id === assemblyId)
  const selectedElection = elections.data?.find((e) => e.id === electionId)

  // Seed the election choice from the globally active election exactly once,
  // then leave it independent — clearing data is a data-defining operation, so
  // the superadmin must be able to target a specific election deliberately.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !activeElectionId) return
    seeded.current = true
    setElectionId(activeElectionId)
  }, [activeElectionId])

  const onError = (e: unknown) => {
    setMessage(null)
    setError(e instanceof Error ? e.message : String(e))
  }
  const onDeleted = (n: number, scope: string) => {
    setError(null)
    setMessage(t(`${n} வாக்குச்சாவடிகள் நீக்கப்பட்டன (${scope})`, `${n} booths deleted (${scope})`))
    void queryClient.invalidateQueries({ queryKey: ['booths'] })
    void queryClient.invalidateQueries({ queryKey: ['assemblies'] })
  }
  const onCleared = (n: number, scope: string) => {
    setError(null)
    setMessage(t(`${n} வாக்குச்சாவடிகளின் பிரச்சார தரவு அழிக்கப்பட்டது (${scope})`, `Campaign data cleared for ${n} booths (${scope})`))
    void queryClient.invalidateQueries({ queryKey: ['booths'] })
  }

  const clearAssemblyElection = useMutation({
    mutationFn: async () => (await getApi()).clearAssemblyElectionData(assemblyId, electionId),
    onSuccess: (n) => onCleared(n, `${selected ? assemblyLabel(selected) : assemblyId} · ${selectedElection?.name ?? electionId}`),
    onError,
  })
  const clearElection = useMutation({
    mutationFn: async () => (await getApi()).clearElectionData(electionId),
    onSuccess: (n) => onCleared(n, selectedElection?.name ?? electionId),
    onError,
  })
  const clearAssembly = useMutation({
    mutationFn: async (id: string) => (await getApi()).clearAssemblyData(id),
    onSuccess: (n) => onDeleted(n, selected ? assemblyLabel(selected) : assemblyId),
    onError,
  })
  const clearAll = useMutation({
    mutationFn: async () => (await getApi()).clearAllData(),
    onSuccess: (n) => onDeleted(n, t('அனைத்து தொகுதிகளும்', 'entire system')),
    onError,
  })

  return (
    <div>
      <p className="hint">
        <L
          ta="கீழே ஒரு தேர்தலையும் (தேவைப்பட்டால் ஒரு தொகுதியையும்) தேர்ந்தெடுக்கவும். செயல்கள் திரும்பப் பெற முடியாதவை."
          en="Select an election below (and an assembly where required). These actions cannot be undone."
        />
      </p>
      <div className="toolbar">
        <select value={electionId} onChange={(e) => setElectionId(e.target.value)}>
          <option value="">{t('தேர்தலைத் தேர்ந்தெடு', 'Select an election')}</option>
          {elections.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.year})
            </option>
          ))}
        </select>
        <select value={assemblyId} onChange={(e) => setAssemblyId(e.target.value)}>
          <option value="">{t('தொகுதியைத் தேர்ந்தெடு', 'Select an assembly')}</option>
          {assemblies.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {assemblyLabel(a)}
            </option>
          ))}
        </select>
      </div>
      {message && <div className="hint">{message}</div>}
      {error && <div className="error">{error}</div>}

      <h3 className="section">
        <L ta="இந்த தேர்தலின் தரவை அழி" en="Clear this election’s data" />
      </h3>
      <p className="hint">
        <L
          ta="இது வாக்குச்சாவடி புவியியலை (தொகுதிகள்/பூத்கள்) வைத்திருக்கும் — தேர்ந்தெடுக்கப்பட்ட தேர்தலின் பிரச்சார தரவை மட்டுமே அழிக்கும் (பூத் ஆரோக்கிய %, விவரக் குறிப்பு புலங்கள், கட்சி வாக்குகள், நடவடிக்கை பட்டியல் மற்றும் குழந்தை வரிசைகள்)."
          en="This keeps booth geography (assemblies/booths) — it only wipes the selected election’s campaign data (booth health %, narrative fields, party votes, action checklist, and child rows)."
        />
      </p>
      {selected && selectedElection && (
        <DangerConfirm
          requiredText={assemblyLabel(selected)}
          disabled={clearAssemblyElection.isPending}
          busy={clearAssemblyElection.isPending}
          label={{ ta: 'இந்த தொகுதியின் இந்த தேர்தல் தரவை அழி', en: 'Clear this assembly’s data for this election' }}
          onConfirm={() => clearAssemblyElection.mutate()}
        />
      )}
      {selectedElection && (
        <DangerConfirm
          requiredText="DELETE ELECTION DATA"
          disabled={clearElection.isPending}
          busy={clearElection.isPending}
          label={{ ta: 'இந்த தேர்தலின் அனைத்து தரவையும் அழி', en: 'Clear all data for this election' }}
          onConfirm={() => clearElection.mutate()}
        />
      )}

      <h3 className="section">
        <L ta="பூத்களை முழுவதுமாக நீக்கு (அனைத்து தேர்தல்களும்)" en="Delete booths entirely (all elections)" />
      </h3>
      <p className="hint">
        <L
          ta="எச்சரிக்கை: இது பூத்களையே நீக்கிவிடும் — ஒரு தேர்தல் மட்டுமல்ல, ஒவ்வொரு தேர்தலின் பிரச்சார தரவும் இதனுடன் நீக்கப்படும். தொகுதிகள்/பயனர்கள் பாதிக்கப்படாது."
          en="Warning: this deletes the booths themselves — this cascades across every election’s data, not just the current one. Assemblies/users are never affected."
        />
      </p>
      {selected && (
        <DangerConfirm
          requiredText={assemblyLabel(selected)}
          disabled={clearAssembly.isPending}
          busy={clearAssembly.isPending}
          label={{ ta: 'இந்த தொகுதியின் பூத்களை நீக்கு', en: 'Delete this assembly’s booths' }}
          onConfirm={() => clearAssembly.mutate(selected.id)}
        />
      )}
      <DangerConfirm
        requiredText="DELETE ALL"
        disabled={clearAll.isPending}
        busy={clearAll.isPending}
        label={{ ta: 'அனைத்து பூத்களையும் நீக்கு', en: 'Delete all booths' }}
        onConfirm={() => clearAll.mutate()}
      />
    </div>
  )
}
