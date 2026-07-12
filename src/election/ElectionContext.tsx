/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getApi } from '../data/api'
import type { Election } from '../types'

interface ElectionState {
  activeElectionId: string | null
  /** The full election row for `activeElectionId`, or null while loading/unset. */
  activeElection: Election | null
  elections: Election[]
  setActiveElectionId(id: string): void
  /** Re-fetches the election list — call after creating/editing an election elsewhere (e.g. ElectionsTab), since this list isn't wired into react-query's cache. */
  refreshElections(): Promise<void>
}

const ElectionContext = createContext<ElectionState | null>(null)

const ACTIVE_ELECTION_KEY = 'boothmgr-active-election'

export function ElectionProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useAuth()
  const [elections, setElections] = useState<Election[]>([])
  const [activeElectionId, setActiveElectionIdState] = useState<string | null>(null)

  // (Re)load the election list whenever sign-in state changes — every
  // approved role can read it (RLS), but there's no point fetching while
  // signed out.
  useEffect(() => {
    if (!signedIn) {
      setElections([])
      setActiveElectionIdState(null)
      return
    }
    let cancelled = false
    void (async () => {
      const list = await (await getApi()).listElections()
      if (cancelled) return
      setElections(list)
      const stored = localStorage.getItem(ACTIVE_ELECTION_KEY)
      if (stored && list.some((election) => election.id === stored)) {
        setActiveElectionIdState(stored)
      } else {
        const active = list.find((election) => election.status === 'active')
        setActiveElectionIdState(active ? active.id : null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn])

  // Called after a superadmin creates/edits an election elsewhere (e.g.
  // ElectionsTab) — this list is plain useState, not react-query, so it
  // isn't picked up by that page's own cache invalidation. Preserves the
  // current selection if it's still valid, rather than re-seeding from
  // scratch and yanking the picker out from under the user.
  async function refreshElections(): Promise<void> {
    const list = await (await getApi()).listElections()
    setElections(list)
    setActiveElectionIdState((current) => {
      if (current && list.some((election) => election.id === current)) return current
      const stored = localStorage.getItem(ACTIVE_ELECTION_KEY)
      if (stored && list.some((election) => election.id === stored)) return stored
      const active = list.find((election) => election.status === 'active')
      return active ? active.id : null
    })
  }

  function setActiveElectionId(id: string): void {
    localStorage.setItem(ACTIVE_ELECTION_KEY, id)
    setActiveElectionIdState(id)
  }

  const activeElection = elections.find((election) => election.id === activeElectionId) ?? null

  return (
    <ElectionContext.Provider
      value={{ activeElectionId, activeElection, elections, setActiveElectionId, refreshElections }}
    >
      {children}
    </ElectionContext.Provider>
  )
}

export function useActiveElection(): ElectionState {
  const ctx = useContext(ElectionContext)
  if (!ctx) throw new Error('useActiveElection must be used inside ElectionProvider')
  return ctx
}
