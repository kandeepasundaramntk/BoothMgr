import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { DangerConfirm } from '../../components/DangerConfirm'
import { getApi } from '../../data/api'
import { L, useT } from '../../i18n'

export default function ClearDataTab() {
  const t = useT()
  const queryClient = useQueryClient()
  const [assemblyId, setAssemblyId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })
  const selected = assemblies.data?.find((a) => a.id === assemblyId)

  const onDone = (n: number, scope: string) => {
    setError(null)
    setMessage(t(`${n} வாக்குச்சாவடிகள் நீக்கப்பட்டன (${scope})`, `${n} booths deleted (${scope})`))
    void queryClient.invalidateQueries({ queryKey: ['booths'] })
    void queryClient.invalidateQueries({ queryKey: ['assemblies'] })
  }
  const onError = (e: unknown) => {
    setMessage(null)
    setError(e instanceof Error ? e.message : String(e))
  }

  const clearAssembly = useMutation({
    mutationFn: async (id: string) => (await getApi()).clearAssemblyData(id),
    onSuccess: (n) => onDone(n, selected?.name ?? assemblyId),
    onError,
  })
  const clearAll = useMutation({
    mutationFn: async () => (await getApi()).clearAllData(),
    onSuccess: (n) => onDone(n, t('அனைத்து தொகுதிகளும்', 'entire system')),
    onError,
  })

  return (
    <div>
      <p className="hint">
        <L
          ta="இது வாக்குச்சாவடி தரவை மட்டும் நீக்கும் (தொகுதிகள்/பயனர்கள் பாதிக்கப்படாது). இதை மாற்ற முடியாது."
          en="This only deletes booth data (assemblies/users are never affected). This cannot be undone."
        />
      </p>
      {message && <div className="hint">{message}</div>}
      {error && <div className="error">{error}</div>}

      <h3 className="section">
        <L ta="இந்த தொகுதி" en="This assembly" />
      </h3>
      <div className="toolbar">
        <select value={assemblyId} onChange={(e) => setAssemblyId(e.target.value)}>
          <option value="">{t('தொகுதியைத் தேர்ந்தெடு', 'Select an assembly')}</option>
          {assemblies.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      {selected && (
        <DangerConfirm
          requiredText={selected.name}
          disabled={clearAssembly.isPending}
          busy={clearAssembly.isPending}
          label={{ ta: 'இந்த தொகுதியின் தரவை அழி', en: 'Clear this assembly’s data' }}
          onConfirm={() => clearAssembly.mutate(selected.id)}
        />
      )}

      <h3 className="section">
        <L ta="முழு அமைப்பும்" en="Entire system" />
      </h3>
      <DangerConfirm
        requiredText="DELETE ALL"
        disabled={clearAll.isPending}
        busy={clearAll.isPending}
        label={{ ta: 'அனைத்து தரவையும் அழி', en: 'Clear all data' }}
        onConfirm={() => clearAll.mutate()}
      />
    </div>
  )
}
