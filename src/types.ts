export interface Assembly {
  id: string
  name: string
}

export type UserRole = 'superadmin' | 'admin' | 'assembly_poc' | 'member'
export type UserStatus = 'pending' | 'approved' | 'rejected'

export interface Profile {
  id: string
  email: string
  full_name: string
  phone: string
  role: UserRole
  status: UserStatus
  assembly_id: string | null
  created_at: string
  approved_at: string | null
  approved_by: string | null
}

export interface SignUpInput {
  full_name: string
  phone: string
  email: string
  password: string
  assembly_id: string
}

export interface Booth {
  id: string
  assembly_id: string
  booth_number: string
  village_ward_area: string
  committed_pct: number | null
  swing_pct: number | null
  opponent_pct: number | null
  macro_trends: string
  alliance_dynamics: string
  candidate_selection: string
  media_narrative: string
  anti_incumbency: string
  beneficiary_mapping: string
  long_pending_issues: string
}

export interface PartyVote {
  party_name: string
  votes: number
}

export interface CastePct {
  caste_name: string
  pct: number
}

export interface ReligionPct {
  religion_name: string
  pct: number
}

export interface Influencer {
  name: string
  contact: string
  role_note: string
}

export type ActionStatus = 'not_started' | 'in_progress' | 'done'

export interface BoothAction {
  action_id: number
  status: ActionStatus
  notes: string
}

/** Full editable state of one booth (form model). */
export interface BoothDetail {
  booth: Booth
  partyVotes: PartyVote[]
  castes: CastePct[]
  religions: ReligionPct[]
  influencers: Influencer[]
  actions: BoothAction[]
}

/** Row in the booth list, with progress info. */
export interface BoothListItem {
  id: string
  booth_number: string
  village_ward_area: string
  committed_pct: number | null
  done_count: number
  in_progress_count: number
}

export interface ActionProgressRow {
  action_id: number
  done_count: number
  in_progress_count: number
  not_started_count: number
}

export interface AssemblySummary {
  booth_count: number
  avg_committed_pct: number | null
  avg_swing_pct: number | null
  avg_opponent_pct: number | null
}

export interface BoothImportRow {
  booth_number: string
  village_ward_area: string
}

/** One row of the append-only audit trail (superadmin-only). */
export interface ActivityLogEntry {
  id: string
  actor_id: string | null
  actor_email: string
  actor_full_name: string
  action_type: string
  target_type: string
  target_id: string | null
  assembly_id: string | null
  /** Opaque jsonb — full old/new for most tables, column-names-only for the three most sensitive ones. Rendered generically. */
  details: unknown
  created_at: string
}

export interface ActivityLogFilter {
  assemblyId?: string
  actorId?: string
  actionType?: string
  /** ISO date/time, inclusive */
  dateFrom?: string
  /** ISO date/time, inclusive */
  dateTo?: string
  limit: number
  offset: number
}

export interface ActivityLogPage {
  rows: ActivityLogEntry[]
  totalCount: number
}

/** Per-assembly backup file shape — downloaded/uploaded as JSON. */
export interface AssemblyBackup {
  format_version: 1
  exported_at: string
  assembly: Assembly
  booths: BoothDetail[]
}

export interface BulkAssemblyUploadRow {
  name: string
  booths?: BoothImportRow[]
}

export interface BulkAssemblyUploadResult {
  assemblies_created: number
  assemblies_skipped: string[]
  booths_created: number
}

export interface RestoreResult {
  booths_upserted: number
  party_votes_upserted: number
  castes_upserted: number
  religions_upserted: number
  influencers_upserted: number
  actions_upserted: number
}
