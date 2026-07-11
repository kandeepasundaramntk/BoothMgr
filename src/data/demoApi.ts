import type {
  ActionProgressRow,
  ActionStatus,
  ActivityLogEntry,
  ActivityLogFilter,
  ActivityLogPage,
  Assembly,
  AssemblyBackup,
  AssemblySummary,
  Booth,
  BoothAction,
  BoothDetail,
  BoothImportRow,
  BoothListItem,
  BulkAssemblyUploadResult,
  BulkAssemblyUploadRow,
  CastePct,
  Election,
  Influencer,
  ParliamentConstituency,
  PartyVote,
  Profile,
  ReligionPct,
  RestoreResult,
  SignUpInput,
  UserRole,
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
// same key AuthContext uses for the fake demo session
const DEMO_SESSION_KEY = 'boothmgr-demo-session'

interface Store {
  assemblies: Assembly[]
  parliamentConstituencies: ParliamentConstituency[]
  elections: Election[]
  booths: Booth[]
  partyVotes: Record<string, PartyVote[]>
  castes: Record<string, CastePct[]>
  religions: Record<string, ReligionPct[]>
  influencers: Record<string, Influencer[]>
  actions: Record<string, BoothAction[]>
  profiles: Profile[]
  activityLog: ActivityLogEntry[]
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

function seedProfiles(assemblyId: string | null): Profile[] {
  const now = new Date().toISOString()
  return [
    {
      id: uuid(),
      email: 'demo@example.com',
      full_name: 'மாதிரி மேல்நிர்வாகி (Demo Super Admin)',
      phone: '00000 00000',
      role: 'superadmin',
      status: 'approved',
      assembly_id: null,
      created_at: now,
      approved_at: now,
      approved_by: null,
    },
    {
      id: uuid(),
      email: 'admin@demo.example',
      full_name: 'மாதிரி நிர்வாகி (Demo Admin)',
      phone: '00000 00011',
      role: 'admin',
      status: 'approved',
      assembly_id: null,
      created_at: now,
      approved_at: now,
      approved_by: null,
    },
    {
      id: uuid(),
      email: 'poc@demo.example',
      full_name: 'மாதிரி பொறுப்பாளர் (Demo POC)',
      phone: '00000 00010',
      role: 'assembly_poc',
      status: 'approved',
      assembly_id: assemblyId,
      created_at: now,
      approved_at: now,
      approved_by: null,
    },
    {
      id: uuid(),
      email: 'pending1@demo.example',
      full_name: 'மாதிரி நபர் 1 (Demo Pending 1)',
      phone: '00000 00001',
      role: 'member',
      status: 'pending',
      assembly_id: assemblyId,
      created_at: now,
      approved_at: null,
      approved_by: null,
    },
    {
      id: uuid(),
      email: 'pending2@demo.example',
      full_name: 'மாதிரி நபர் 2 (Demo Pending 2)',
      phone: '00000 00002',
      role: 'member',
      status: 'pending',
      assembly_id: assemblyId,
      created_at: now,
      approved_at: null,
      approved_by: null,
    },
  ]
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
    assemblies: [
      {
        id: assemblyId,
        name: 'மாதிரி தொகுதி (Demo Assembly)',
        parliament_constituency_id: null,
        constituency_code: '',
        district: '',
        state_code: 'TN',
      },
    ],
    parliamentConstituencies: [],
    elections: [],
    profiles: seedProfiles(assemblyId),
    activityLog: [],
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
      // stores written before profiles existed
      store.profiles ??= seedProfiles(store.assemblies[0]?.id ?? null)
      // stores written before created_at/approved_at/approved_by existed
      for (const p of store.profiles) {
        p.created_at ??= new Date(0).toISOString()
        p.approved_at ??= p.status === 'approved' ? new Date(0).toISOString() : null
        p.approved_by ??= null
      }
      // stores written before the activity log existed
      store.activityLog ??= []
      // stores written before the parliament-constituency / assembly-location fields existed
      for (const a of store.assemblies) {
        a.parliament_constituency_id ??= null
        a.constituency_code ??= ''
        a.district ??= ''
        a.state_code ??= 'TN'
      }
      store.parliamentConstituencies ??= []
      // stores written before elections existed
      store.elections ??= []
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

const isAdminLike = (role: UserRole): boolean => role === 'admin' || role === 'superadmin'

/**
 * Who is "signed in" right now — resolved from the fake session email.
 * Unknown emails resolve to the admin profile so the long-standing demo
 * behavior "any email/password signs in" keeps working.
 */
function currentProfile(store: Store): Profile {
  const email = sessionStorage.getItem(DEMO_SESSION_KEY)
  const match = store.profiles.find((p) => p.email === email)
  return match ?? store.profiles.find((p) => isAdminLike(p.role)) ?? store.profiles[0]
}

// Nudges same-millisecond entries apart so `created_at desc` sort order stays
// stable within a fast synchronous loop (e.g. restoring 50 booths) — Postgres
// timestamps have microsecond resolution and don't need this.
let logSeq = 0

function logActivity(
  store: Store,
  me: Profile,
  actionType: string,
  targetType: string,
  targetId: string | null,
  assemblyId: string | null,
  details: unknown,
): void {
  store.activityLog.push({
    id: uuid(),
    actor_id: me.id,
    actor_email: me.email,
    actor_full_name: me.full_name,
    action_type: actionType,
    target_type: targetType,
    target_id: targetId,
    assembly_id: assemblyId,
    details,
    created_at: new Date(Date.now() + logSeq++).toISOString(),
  })
}

/** Demo counterpart of supabase auth.signUp — called from AuthContext. */
export function demoSignUp(input: SignUpInput): void {
  const store = load()
  if (store.profiles.some((p) => p.email === input.email)) {
    throw new Error(`${input.email} ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது (already registered)`)
  }
  store.profiles.push({
    id: uuid(),
    email: input.email,
    full_name: input.full_name,
    phone: input.phone,
    role: 'member',
    status: 'pending',
    assembly_id: input.assembly_id,
    created_at: new Date().toISOString(),
    approved_at: null,
    approved_by: null,
  })
  persist(store)
}

export function createDemoApi(): DataApi {
  return {
    async listAssemblies(): Promise<Assembly[]> {
      const store = load()
      const me = currentProfile(store)
      // mirrors the scoped RLS: admins see everything, others their assembly
      const visible =
        isAdminLike(me.role) ? store.assemblies : store.assemblies.filter((a) => a.id === me.assembly_id)
      return [...visible].sort((a, b) => a.name.localeCompare(b.name))
    },

    async createAssembly(input: {
      name: string
      parliament_constituency_id?: string | null
      constituency_code?: string
      district?: string
      state_code?: string
    }): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'superadmin') throw new Error('அனுமதி இல்லை (not allowed)')
      if (store.assemblies.some((a) => a.name === input.name)) {
        throw new Error(`"${input.name}" ஏற்கனவே உள்ளது (assembly already exists)`)
      }
      const assembly: Assembly = {
        id: uuid(),
        name: input.name,
        parliament_constituency_id: input.parliament_constituency_id ?? null,
        constituency_code: input.constituency_code ?? '',
        district: input.district ?? '',
        state_code: input.state_code ?? 'TN',
      }
      store.assemblies.push(assembly)
      logActivity(store, me, 'assemblies.insert', 'assemblies', assembly.id, assembly.id, {
        name: assembly.name,
        parliament_constituency_id: assembly.parliament_constituency_id,
        constituency_code: assembly.constituency_code,
        district: assembly.district,
        state_code: assembly.state_code,
      })
      persist(store)
    },

    async updateAssembly(
      id: string,
      patch: Partial<Pick<Assembly, 'parliament_constituency_id' | 'constituency_code' | 'district' | 'state_code'>>,
    ): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'superadmin') throw new Error('அனுமதி இல்லை (not allowed)')
      const assembly = store.assemblies.find((a) => a.id === id)
      if (!assembly) throw new Error('Assembly not found')
      Object.assign(assembly, patch)
      logActivity(store, me, 'assemblies.update', 'assemblies', assembly.id, assembly.id, patch)
      persist(store)
    },

    async listParliamentConstituencies(): Promise<ParliamentConstituency[]> {
      const store = load()
      return structuredClone([...store.parliamentConstituencies].sort((a, b) => a.name.localeCompare(b.name)))
    },

    async createParliamentConstituency(input: { name: string; pc_code?: string; state_code?: string }): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'superadmin') throw new Error('அனுமதி இல்லை (not allowed)')
      if (store.parliamentConstituencies.some((pc) => pc.name === input.name)) {
        throw new Error(`"${input.name}" ஏற்கனவே உள்ளது (parliament constituency already exists)`)
      }
      const pc: ParliamentConstituency = {
        id: uuid(),
        name: input.name,
        pc_code: input.pc_code ?? '',
        state_code: input.state_code ?? 'TN',
        created_at: new Date().toISOString(),
      }
      store.parliamentConstituencies.push(pc)
      logActivity(store, me, 'parliament_constituencies.insert', 'parliament_constituencies', pc.id, null, {
        name: pc.name,
        pc_code: pc.pc_code,
        state_code: pc.state_code,
      })
      persist(store)
    },

    async listElections(): Promise<Election[]> {
      const store = load()
      return structuredClone([...store.elections].sort((a, b) => b.year - a.year))
    },

    async createElection(input: { name: string; year: number }): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'superadmin') throw new Error('அனுமதி இல்லை (not allowed)')
      const election: Election = {
        id: uuid(),
        name: input.name,
        year: input.year,
        status: 'upcoming',
        created_at: new Date().toISOString(),
      }
      store.elections.push(election)
      logActivity(store, me, 'elections.insert', 'elections', election.id, null, {
        name: election.name,
        year: election.year,
        status: election.status,
      })
      persist(store)
    },

    async setElectionStatus(id: string, status: Election['status']): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'superadmin') throw new Error('அனுமதி இல்லை (not allowed)')
      const election = store.elections.find((e) => e.id === id)
      if (!election) throw new Error('Election not found')
      election.status = status
      logActivity(store, me, 'elections.update', 'elections', election.id, null, { status })
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
      const me = currentProfile(store)
      const existing = new Set(store.booths.filter((b) => b.assembly_id === assemblyId).map((b) => b.booth_number))
      let added = 0
      for (const row of rows) {
        if (existing.has(row.booth_number)) continue
        existing.add(row.booth_number)
        const booth = emptyBooth(uuid(), assemblyId, row.booth_number, row.village_ward_area)
        store.booths.push(booth)
        logActivity(store, me, 'booths.insert', 'booths', booth.id, assemblyId, { booth_number: row.booth_number })
        added++
      }
      persist(store)
      return added
    },

    async createBooth(assemblyId: string, boothNumber: string, villageWardArea: string): Promise<string> {
      const store = load()
      const me = currentProfile(store)
      if (store.booths.some((b) => b.assembly_id === assemblyId && b.booth_number === boothNumber)) {
        throw new Error(`பூத் ${boothNumber} ஏற்கனவே உள்ளது (booth already exists)`)
      }
      const id = uuid()
      store.booths.push(emptyBooth(id, assemblyId, boothNumber, villageWardArea))
      logActivity(store, me, 'booths.insert', 'booths', id, assemblyId, { booth_number: boothNumber })
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
      const me = currentProfile(store)
      const idx = store.booths.findIndex((b) => b.id === detail.booth.id)
      if (idx === -1) throw new Error('Booth not found')
      store.booths[idx] = structuredClone(detail.booth)
      store.partyVotes[detail.booth.id] = detail.partyVotes.filter((v) => v.party_name.trim())
      store.castes[detail.booth.id] = detail.castes.filter((c) => c.caste_name.trim())
      store.religions[detail.booth.id] = detail.religions.filter((r) => r.religion_name.trim())
      store.influencers[detail.booth.id] = detail.influencers.filter((f) => f.name.trim() || f.contact.trim())
      // One entry per child-array type actually touched by the save, not a
      // true per-row diff — demoApi is for workflow testing, not for testing
      // the audit log's row-level granularity (the real SQL trigger logs
      // true per-row inserts/updates/deletes; this is an accepted fidelity gap).
      const assemblyId = detail.booth.assembly_id
      logActivity(store, me, 'booths.update', 'booths', detail.booth.id, assemblyId, {})
      logActivity(store, me, 'booth_party_votes.update', 'booth_party_votes', detail.booth.id, assemblyId, {})
      logActivity(store, me, 'booth_caste_pct.update', 'booth_caste_pct', detail.booth.id, assemblyId, {})
      logActivity(store, me, 'booth_religion_pct.update', 'booth_religion_pct', detail.booth.id, assemblyId, {})
      logActivity(store, me, 'booth_influencers.update', 'booth_influencers', detail.booth.id, assemblyId, {})
      persist(store)
    },

    async setActionStatus(boothId: string, actionId: number, status: ActionStatus, notes: string): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      const list = store.actions[boothId] ?? []
      const existing = list.find((a) => a.action_id === actionId)
      if (existing) {
        existing.status = status
        existing.notes = notes
      } else {
        list.push({ action_id: actionId, status, notes })
      }
      store.actions[boothId] = list
      const assemblyId = store.booths.find((b) => b.id === boothId)?.assembly_id ?? null
      logActivity(store, me, existing ? 'booth_actions.update' : 'booth_actions.insert', 'booth_actions', boothId, assemblyId, {
        action_id: actionId,
        status,
      })
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

    async getMyProfile(): Promise<Profile | null> {
      const store = load()
      const email = sessionStorage.getItem(DEMO_SESSION_KEY)
      if (!email) return null
      // exact match first (pending/POC test users); unknown emails act as admin
      return structuredClone(currentProfile(store))
    },

    async listSignupAssemblies(): Promise<Assembly[]> {
      const store = load()
      return [...store.assemblies].sort((a, b) => a.name.localeCompare(b.name))
    },

    async listProfiles(): Promise<Profile[]> {
      const store = load()
      const me = currentProfile(store)
      const visible =
        isAdminLike(me.role)
          ? store.profiles
          : me.role === 'assembly_poc'
            ? store.profiles.filter((p) => p.assembly_id === me.assembly_id || p.id === me.id)
            : store.profiles.filter((p) => p.id === me.id)
      return structuredClone(visible)
    },

    async approveProfile(userId: string): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      const target = store.profiles.find((p) => p.id === userId)
      if (!target) throw new Error('User not found')
      const allowed =
        isAdminLike(me.role) || (me.role === 'assembly_poc' && target.assembly_id === me.assembly_id)
      if (!allowed) throw new Error('அனுமதி இல்லை (not allowed)')
      target.status = 'approved'
      logActivity(store, me, 'profiles.update', 'profiles', target.id, target.assembly_id, { status: 'approved' })
      persist(store)
    },

    async rejectProfile(userId: string): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      const target = store.profiles.find((p) => p.id === userId)
      if (!target) throw new Error('User not found')
      const allowed =
        isAdminLike(me.role) || (me.role === 'assembly_poc' && target.assembly_id === me.assembly_id)
      if (!allowed) throw new Error('அனுமதி இல்லை (not allowed)')
      target.status = 'rejected'
      logActivity(store, me, 'profiles.update', 'profiles', target.id, target.assembly_id, { status: 'rejected' })
      persist(store)
    },

    async setProfileRole(userId: string, role: UserRole): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      const target = store.profiles.find((p) => p.id === userId)
      if (!target) throw new Error('User not found')
      const currentRole = target.role
      const touchesAdminTier =
        currentRole === 'admin' || currentRole === 'superadmin' || role === 'admin' || role === 'superadmin'
      if (touchesAdminTier ? me.role !== 'superadmin' : !isAdminLike(me.role)) {
        throw new Error('அனுமதி இல்லை (not allowed)')
      }
      if (
        role !== currentRole &&
        (currentRole === 'admin' || currentRole === 'superadmin') &&
        store.profiles.filter((p) => p.id !== target.id && p.role === currentRole && p.status === 'approved')
          .length === 0
      ) {
        throw new Error(
          currentRole === 'superadmin'
            ? 'கடைசி மேல்நிர்வாகியை பதவி நீக்கம் செய்ய முடியாது (cannot demote the last superadmin)'
            : 'கடைசி நிர்வாகியை பதவி நீக்கம் செய்ய முடியாது (cannot demote the last admin)',
        )
      }
      logActivity(store, me, 'profiles.update', 'profiles', target.id, target.assembly_id, {
        role: { from: currentRole, to: role },
      })
      target.role = role
      persist(store)
    },

    async getActivityLog(filter: ActivityLogFilter): Promise<ActivityLogPage> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'superadmin') throw new Error('அனுமதி இல்லை (not allowed)')
      let rows = [...store.activityLog].sort((a, b) => b.created_at.localeCompare(a.created_at))
      if (filter.assemblyId) rows = rows.filter((r) => r.assembly_id === filter.assemblyId)
      if (filter.actorId) rows = rows.filter((r) => r.actor_id === filter.actorId)
      if (filter.actionType) rows = rows.filter((r) => r.action_type === filter.actionType)
      if (filter.dateFrom) rows = rows.filter((r) => r.created_at >= filter.dateFrom!)
      if (filter.dateTo) rows = rows.filter((r) => r.created_at <= filter.dateTo!)
      const totalCount = rows.length
      return { rows: structuredClone(rows.slice(filter.offset, filter.offset + filter.limit)), totalCount }
    },

    async logViewAs(action: 'start' | 'end', targetProfile: Profile): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'superadmin') throw new Error('அனுமதி இல்லை (not allowed)')
      logActivity(store, me, `view_as.${action}`, 'profile', targetProfile.id, targetProfile.assembly_id, {
        target_email: targetProfile.email,
        target_full_name: targetProfile.full_name,
        target_role: targetProfile.role,
        target_status: targetProfile.status,
      })
      persist(store)
    },

    async restoreAssemblyBackup(assemblyId: string, backup: AssemblyBackup): Promise<RestoreResult> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'superadmin') throw new Error('அனுமதி இல்லை (not allowed)')
      if (backup.format_version !== 1) throw new Error('Unsupported backup format version')
      if (!store.assemblies.some((a) => a.id === assemblyId)) throw new Error('Assembly not found')

      const result: RestoreResult = {
        booths_upserted: 0,
        party_votes_upserted: 0,
        castes_upserted: 0,
        religions_upserted: 0,
        influencers_upserted: 0,
        actions_upserted: 0,
      }

      const upsertByKey = <T, K extends keyof T>(existingRows: T[], incoming: T[], keyField: K): T[] => {
        const byKey = new Map<T[K], T>(existingRows.map((r) => [r[keyField], r]))
        for (const row of incoming) byKey.set(row[keyField], row)
        return [...byKey.values()]
      }

      for (const detail of backup.booths) {
        let booth = store.booths.find((b) => b.assembly_id === assemblyId && b.booth_number === detail.booth.booth_number)
        if (booth) {
          Object.assign(booth, { ...detail.booth, id: booth.id, assembly_id: assemblyId })
        } else {
          booth = { ...detail.booth, id: uuid(), assembly_id: assemblyId }
          store.booths.push(booth)
        }
        result.booths_upserted++

        store.partyVotes[booth.id] = upsertByKey(store.partyVotes[booth.id] ?? [], detail.partyVotes, 'party_name')
        result.party_votes_upserted += detail.partyVotes.length
        store.castes[booth.id] = upsertByKey(store.castes[booth.id] ?? [], detail.castes, 'caste_name')
        result.castes_upserted += detail.castes.length
        store.religions[booth.id] = upsertByKey(store.religions[booth.id] ?? [], detail.religions, 'religion_name')
        result.religions_upserted += detail.religions.length
        store.influencers[booth.id] = upsertByKey(store.influencers[booth.id] ?? [], detail.influencers, 'name')
        result.influencers_upserted += detail.influencers.length
        store.actions[booth.id] = upsertByKey(store.actions[booth.id] ?? [], detail.actions, 'action_id')
        result.actions_upserted += detail.actions.length
      }

      logActivity(store, me, 'backup.restore', 'assembly', assemblyId, assemblyId, {
        booths_count: result.booths_upserted,
        source_exported_at: backup.exported_at,
      })
      persist(store)
      return result
    },

    async bulkCreateAssemblies(rows: BulkAssemblyUploadRow[]): Promise<BulkAssemblyUploadResult> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'superadmin') throw new Error('அனுமதி இல்லை (not allowed)')

      const result: BulkAssemblyUploadResult = { assemblies_created: 0, assemblies_skipped: [], booths_created: 0 }

      for (const entry of rows) {
        let assembly = store.assemblies.find((a) => a.name === entry.name)
        if (assembly) {
          result.assemblies_skipped.push(entry.name)
        } else {
          assembly = {
            id: uuid(),
            name: entry.name,
            parliament_constituency_id: null,
            constituency_code: '',
            district: '',
            state_code: 'TN',
          }
          store.assemblies.push(assembly)
          result.assemblies_created++
        }
        for (const b of entry.booths ?? []) {
          if (store.booths.some((existing) => existing.assembly_id === assembly!.id && existing.booth_number === b.booth_number)) {
            continue
          }
          store.booths.push(emptyBooth(uuid(), assembly.id, b.booth_number, b.village_ward_area))
          result.booths_created++
        }
      }

      logActivity(store, me, 'assemblies.bulk_create', 'assembly', null, null, {
        assemblies_created: result.assemblies_created,
        assemblies_skipped: result.assemblies_skipped,
        booths_created: result.booths_created,
      })
      persist(store)
      return result
    },

    async clearAssemblyData(assemblyId: string): Promise<number> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'superadmin') throw new Error('அனுமதி இல்லை (not allowed)')
      const toRemove = new Set(store.booths.filter((b) => b.assembly_id === assemblyId).map((b) => b.id))
      const count = toRemove.size
      store.booths = store.booths.filter((b) => !toRemove.has(b.id))
      for (const id of toRemove) {
        delete store.partyVotes[id]
        delete store.castes[id]
        delete store.religions[id]
        delete store.influencers[id]
        delete store.actions[id]
      }
      logActivity(store, me, 'data.clear_assembly', 'assembly', assemblyId, assemblyId, { booths_deleted: count })
      persist(store)
      return count
    },

    async clearAllData(): Promise<number> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'superadmin') throw new Error('அனுமதி இல்லை (not allowed)')
      const count = store.booths.length
      store.booths = []
      store.partyVotes = {}
      store.castes = {}
      store.religions = {}
      store.influencers = {}
      store.actions = {}
      logActivity(store, me, 'data.clear_all', 'system', null, null, { booths_deleted: count })
      persist(store)
      return count
    },
  }
}
