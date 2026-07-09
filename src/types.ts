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
