import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getApi } from '../data/api'

export default function AssembliesPage() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const assemblies = useQuery({
    queryKey: ['assemblies'],
    queryFn: async () => (await getApi()).listAssemblies(),
  })

  const create = useMutation({
    mutationFn: async (n: string) => (await getApi()).createAssembly(n),
    onSuccess: () => {
      setName('')
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['assemblies'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) create.mutate(name.trim())
  }

  return (
    <div className="card">
      <h2 className="page-title">
        சட்டமன்றத் தொகுதிகள் <span className="en">(Assemblies)</span>
      </h2>
      {error && <div className="error">{error}</div>}
      {assemblies.isLoading && <p>Loading…</p>}
      {assemblies.isError && <div className="error">{String(assemblies.error)}</div>}
      {assemblies.data && assemblies.data.length === 0 && (
        <p className="hint">தொகுதிகள் எதுவும் இல்லை — கீழே ஒன்றைச் சேர்க்கவும். (No assemblies yet — add one below.)</p>
      )}
      {assemblies.data && assemblies.data.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th>
                தொகுதி <span className="en">(Assembly)</span>
              </th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {assemblies.data.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link to={`/assembly/${a.id}`}>{a.name}</Link>
                </td>
                <td>
                  <Link className="btn small secondary" to={`/assembly/${a.id}/dashboard`}>
                    டாஷ்போர்டு / Dashboard
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form className="toolbar" style={{ marginTop: 14 }} onSubmit={onSubmit}>
        <input
          placeholder="புதிய தொகுதியின் பெயர் / New assembly name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <button className="btn" type="submit" disabled={create.isPending || !name.trim()}>
          சேர் / Add
        </button>
      </form>
    </div>
  )
}
