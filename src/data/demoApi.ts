import type {
  ActionProgressRow,
  ActionStatus,
  Assembly,
  AssemblySummary,
  Booth,
  BoothAction,
  BoothDetail,
  BoothImportRow,
  BoothListItem,
  CastePct,
  Influencer,
  PartyVote,
  ReligionPct,
} from '../types'
import { ACTIONS } from './actionsCatalog'
import type { DataApi } from './api'

/**
 * Browser-only implementation backed by localStorage, used when VITE_DEMO=1.
 * All seed data is fictional (மாதிரி / demo naming — see CLAUDE.md, Data
 * Sensitivity). Aggregates mirror the SQL views booth_completion,
 * assembly_health_summary and action_progress — keep the math consistent.
 */

const STORE_KEY = 'boothmgr-demo-v1'

interface Store {
  assemblies: Assembly[]
  booths: Booth[]
  partyVotes: Record<string, PartyVote[]>
  castes: Record<string, CastePct[]>
  religions: Record<string, ReligionPct[]>
  influencers: Record<string, Influencer[]>
  actions: Record<string, BoothAction[]>
}

function uuid(): string {
  return crypto.randomUUID()
}

function emptyBooth(id: string, assemblyId: string, boothNumber: string, village: string): Booth {
  return {
    id,
    assembly_id: assemblyId,
    booth_number: boothNumber,
    village_ward_area: village,
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
  }
}

function seed(): Store {
  const assemblyId = uuid()
  const b1 = uuid()
  const b2 = uuid()
  const b3 = uuid()

  const booth1: Booth = {
    ...emptyBooth(b1, assemblyId, '1', 'மாதிரி கிராமம் வடக்கு (Demo Village North)'),
    committed_pct: 55,
    swing_pct: 25,
    opponent_pct: 20,
    macro_trends: 'மாதிரி: குடிநீர் பற்றாக்குறை, வேலைவாய்ப்பு (demo text)',
    alliance_dynamics: 'மாதிரி: சுயேச்சை வேட்பாளர் ஒருவர் (demo text)',
  }
  const booth2: Booth = {
    ...emptyBooth(b2, assemblyId, '2', 'மாதிரி கிராமம் தெற்கு (Demo Village South)'),
    committed_pct: 30,
    swing_pct: 40,
    opponent_pct: 30,
  }
  const booth3 = emptyBooth(b3, assemblyId, '3', 'மாதிரி நகரம் வார்டு 4 (Demo Town Ward 4)')

  return {
    assemblies: [{ id: assemblyId, name: 'மாதிரி தொகுதி (Demo Assembly)' }],
    booths: [booth1, booth2, booth3],
    partyVotes: {
      [b1]: [
        { party_name: 'மாதிரி கட்சி A (Demo Party A)', votes: 420 },
        { party_name: 'மாதிரி கட்சி B (Demo Party B)', votes: 310 },
      ],
    },
    castes: {
      [b1]: [
        { caste_name: 'மாதிரி சாதி 1 (Demo 1)', pct: 60 },
        { caste_name: 'மாதிரி சாதி 2 (Demo 2)', pct: 40 },
      ],
    },
    religions: {
      [b1]: [{ religion_name: 'மாதிரி மதம் (Demo)', pct: 100 }],
    },
    influencers: {
      [b1]: [{ name: 'மாதிரி நபர் (Demo Person)', contact: '00000 00000', role_note: 'மாதிரி சங்கத் தலைவர்' }],
    },
    actions: {
      [b1]: [
        { action_id: 1, status: 'done', notes: 'மாதிரி குறிப்பு (demo note)' },
        { action_id: 2, status: 'done', notes: '' },
        { action_id: 3, status: 'in_progress', notes: '' },
        { action_id: 10, status: 'done', notes: '' },
      ],
      [b2]: [
        { action_id: 1, status: 'in_progress', notes: '' },
        { action_id: 10, status: 'done', notes: '' },
      ],
    },
  }
}

function load(): Store {
  const raw = localStorage.getItem(STORE_KEY)
  if (raw) {
    try {
      const store = JSON.parse(raw) as Store
      // stores written before the long_pending_issues column existed
      for (const b of store.booths) b.long_pending_issues ??= ''
      return store
    } catch {
      // corrupted store — fall through to a fresh seed
    }
  }
  const fresh = seed()
  localStorage.setItem(STORE_KEY, JSON.stringify(fresh))
  return fresh
}

function persist(store: Store): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

function boothNumberCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

function counts(actions: BoothAction[] | undefined): { done: number; inProgress: number } {
  let done = 0
  let inProgress = 0
  for (const a of actions ?? []) {
    if (a.status === 'done') done++
    else if (a.status === 'in_progress') inProgress++
  }
  return { done, inProgress }
}

/** SQL avg(): ignores nulls, null when no non-null values. */
function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length === 0) return null
  return nums.reduce((s, v) => s + v, 0) / nums.length
}

function toListItem(store: Store, b: Booth): BoothListItem {
  const { done, inProgress } = counts(store.actions[b.id])
  return {
    id: b.id,
    booth_number: b.booth_number,
    village_ward_area: b.village_ward_area,
    committed_pct: b.committed_pct,
    done_count: done,
    in_progress_count: inProgress,
  }
}

function toDetail(store: Store, b: Booth): BoothDetail {
  return {
    booth: structuredClone(b),
    partyVotes: structuredClone(store.partyVotes[b.id] ?? []),
    castes: structuredClone(store.castes[b.id] ?? []),
    religions: structuredClone(store.religions[b.id] ?? []),
    influencers: structuredClone(store.influencers[b.id] ?? []),
    actions: structuredClone(store.actions[b.id] ?? []),
  }
}

export function createDemoApi(): DataApi {
  return {
    async listAssemblies(): Promise<Assembly[]> {
      const store = load()
      return [...store.assemblies].sort((a, b) => a.name.localeCompare(b.name))
    },

    async createAssembly(name: string): Promise<void> {
      const store = load()
      if (store.assemblies.some((a) => a.name === name)) {
        throw new Error(`"${name}" ஏற்கனவே உள்ளது (assembly already exists)`)
      }
      store.assemblies.push({ id: uuid(), name })
      persist(store)
    },

    async listBooths(assemblyId: string): Promise<BoothListItem[]> {
      const store = load()
      return store.booths
        .filter((b) => b.assembly_id === assemblyId)
        .map((b) => toListItem(store, b))
        .sort((a, b) => boothNumberCompare(a.booth_number, b.booth_number))
    },

    async importBooths(assemblyId: string, rows: BoothImportRow[]): Promise<number> {
      const store = load()
      const existing = new Set(store.booths.filter((b) => b.assembly_id === assemblyId).map((b) => b.booth_number))
      let added = 0
      for (const row of rows) {
        if (existing.has(row.booth_number)) continue
        existing.add(row.booth_number)
        store.booths.push(emptyBooth(uuid(), assemblyId, row.booth_number, row.village_ward_area))
        added++
      }
      persist(store)
      return added
    },

    async createBooth(assemblyId: string, boothNumber: string, villageWardArea: string): Promise<string> {
      const store = load()
      if (store.booths.some((b) => b.assembly_id === assemblyId && b.booth_number === boothNumber)) {
        throw new Error(`பூத் ${boothNumber} ஏற்கனவே உள்ளது (booth already exists)`)
      }
      const id = uuid()
      store.booths.push(emptyBooth(id, assemblyId, boothNumber, villageWardArea))
      persist(store)
      return id
    },

    async getBoothDetail(boothId: string): Promise<BoothDetail> {
      const store = load()
      const booth = store.booths.find((b) => b.id === boothId)
      if (!booth) throw new Error('Booth not found')
      return toDetail(store, booth)
    },

    async saveBoothDetail(detail: BoothDetail): Promise<void> {
      const store = load()
      const idx = store.booths.findIndex((b) => b.id === detail.booth.id)
      if (idx === -1) throw new Error('Booth not found')
      store.booths[idx] = structuredClone(detail.booth)
      store.partyVotes[detail.booth.id] = detail.partyVotes.filter((v) => v.party_name.trim())
      store.castes[detail.booth.id] = detail.castes.filter((c) => c.caste_name.trim())
      store.religions[detail.booth.id] = detail.religions.filter((r) => r.religion_name.trim())
      store.influencers[detail.booth.id] = detail.influencers.filter((f) => f.name.trim() || f.contact.trim())
      persist(store)
    },

    async setActionStatus(boothId: string, actionId: number, status: ActionStatus, notes: string): Promise<void> {
      const store = load()
      const list = store.actions[boothId] ?? []
      const existing = list.find((a) => a.action_id === actionId)
      if (existing) {
        existing.status = status
        existing.notes = notes
      } else {
        list.push({ action_id: actionId, status, notes })
      }
      store.actions[boothId] = list
      persist(store)
    },

    async getAssemblySummary(assemblyId: string): Promise<AssemblySummary> {
      const store = load()
      const booths = store.booths.filter((b) => b.assembly_id === assemblyId)
      return {
        booth_count: booths.length,
        avg_committed_pct: avg(booths.map((b) => b.committed_pct)),
        avg_swing_pct: avg(booths.map((b) => b.swing_pct)),
        avg_opponent_pct: avg(booths.map((b) => b.opponent_pct)),
      }
    },

    async getWeakestBooths(assemblyId: string, limit: number): Promise<BoothListItem[]> {
      const store = load()
      return store.booths
        .filter((b) => b.assembly_id === assemblyId && b.committed_pct !== null)
        .sort((a, b) => (a.committed_pct ?? 0) - (b.committed_pct ?? 0))
        .slice(0, limit)
        .map((b) => toListItem(store, b))
    },

    async getActionProgress(assemblyId: string): Promise<ActionProgressRow[]> {
      const store = load()
      const booths = store.booths.filter((b) => b.assembly_id === assemblyId)
      return ACTIONS.map((action) => {
        let done = 0
        let inProgress = 0
        for (const b of booths) {
          const st = store.actions[b.id]?.find((a) => a.action_id === action.id)
          if (st?.status === 'done') done++
          else if (st?.status === 'in_progress') inProgress++
        }
        return {
          action_id: action.id,
          done_count: done,
          in_progress_count: inProgress,
          not_started_count: booths.length - done - inProgress,
        }
      })
    },

    async getAssemblyExport(assemblyId: string): Promise<BoothDetail[]> {
      const store = load()
      return store.booths
        .filter((b) => b.assembly_id === assemblyId)
        .sort((a, b) => boothNumberCompare(a.booth_number, b.booth_number))
        .map((b) => toDetail(store, b))
    },
  }
}
