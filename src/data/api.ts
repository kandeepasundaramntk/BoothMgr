import type {
  ActionProgressRow,
  ActionStatus,
  ActivityLogFilter,
  ActivityLogPage,
  Assembly,
  AssemblyBackup,
  AssemblySummary,
  BoothDetail,
  BoothImportRow,
  BoothListItem,
  BulkAssemblyUploadResult,
  BulkAssemblyUploadRow,
  ParliamentConstituency,
  Profile,
  RestoreResult,
  UserRole,
} from '../types'

/**
 * Every page talks to the backend through this interface — never call
 * Supabase directly from a page. getApi() picks the implementation:
 * demoApi (localStorage) when VITE_DEMO=1, supabaseApi otherwise.
 */
export interface DataApi {
  listAssemblies(): Promise<Assembly[]>
  createAssembly(input: {
    name: string
    parliament_constituency_id?: string | null
    constituency_code?: string
    district?: string
    state_code?: string
  }): Promise<void>
  updateAssembly(
    id: string,
    patch: Partial<Pick<Assembly, 'parliament_constituency_id' | 'constituency_code' | 'district' | 'state_code'>>,
  ): Promise<void>
  listParliamentConstituencies(): Promise<ParliamentConstituency[]>
  createParliamentConstituency(input: { name: string; pc_code?: string; state_code?: string }): Promise<void>
  listBooths(assemblyId: string): Promise<BoothListItem[]>
  /** Adds booths that don't exist yet (matched by booth_number); returns how many were added. */
  importBooths(assemblyId: string, rows: BoothImportRow[]): Promise<number>
  /** Returns the new booth's id. */
  createBooth(assemblyId: string, boothNumber: string, villageWardArea: string): Promise<string>
  getBoothDetail(boothId: string): Promise<BoothDetail>
  /** Saves the booth row and its repeating child rows; action statuses are saved separately. */
  saveBoothDetail(detail: BoothDetail): Promise<void>
  setActionStatus(boothId: string, actionId: number, status: ActionStatus, notes: string): Promise<void>
  getAssemblySummary(assemblyId: string): Promise<AssemblySummary>
  /** Booths with a recorded health score, lowest committed % first. */
  getWeakestBooths(assemblyId: string, limit: number): Promise<BoothListItem[]>
  getActionProgress(assemblyId: string): Promise<ActionProgressRow[]>
  getAssemblyExport(assemblyId: string): Promise<BoothDetail[]>

  // ---- users & approval ----
  /** The signed-in user's own profile; null when no profile row exists yet. */
  getMyProfile(): Promise<Profile | null>
  /** Assembly names for the signup dropdown — works before authentication. */
  listSignupAssemblies(): Promise<Assembly[]>
  /** Profiles the current user may see (RLS-scoped: admin all, POC own assembly). */
  listProfiles(): Promise<Profile[]>
  approveProfile(userId: string): Promise<void>
  rejectProfile(userId: string): Promise<void>
  /**
   * Change a user's role. Promoting/demoting between assembly_poc and
   * member requires admin or superadmin; any change touching admin or
   * superadmin requires superadmin. Enforced server-side (RLS/RPC) and
   * mirrored in demoApi.
   */
  setProfileRole(userId: string, role: UserRole): Promise<void>

  // ---- superadmin tools ----
  /** Superadmin-only; paginated/filterable audit trail of every logged administrative and booth-level write. */
  getActivityLog(filter: ActivityLogFilter): Promise<ActivityLogPage>
  /** Superadmin-only; records the start/end of a "view as" session (no data mutation occurs). */
  logViewAs(action: 'start' | 'end', targetProfile: Profile): Promise<void>
  /** Superadmin-only; upserts every booth/child row in `backup` into `assemblyId` (merge, not destructive replace). */
  restoreAssemblyBackup(assemblyId: string, backup: AssemblyBackup): Promise<RestoreResult>
  /** Superadmin-only; creates assemblies (and optionally their nested booths) from a JSON upload; existing names are skipped, not errored. */
  bulkCreateAssemblies(rows: BulkAssemblyUploadRow[]): Promise<BulkAssemblyUploadResult>
  /** Superadmin-only; deletes every booth (and cascaded child rows) in one assembly. Does NOT delete the assembly itself. Returns the number of booths deleted. */
  clearAssemblyData(assemblyId: string): Promise<number>
  /** Superadmin-only; deletes every booth (and cascaded child rows) across ALL assemblies. Does NOT delete assemblies or profiles. Returns the number of booths deleted. */
  clearAllData(): Promise<number>
}

export function hasSupabaseConfig(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

// Demo when asked for explicitly — or in `npm run dev` with no Supabase keys,
// so the dev environment works out of the box. Production builds without keys
// still show the not-configured error instead of silently serving demo data.
export const isDemoMode = import.meta.env.VITE_DEMO === '1' || (import.meta.env.DEV && !hasSupabaseConfig())

let apiPromise: Promise<DataApi> | null = null

export function getApi(): Promise<DataApi> {
  if (!apiPromise) {
    apiPromise = isDemoMode
      ? import('./demoApi').then((m) => m.createDemoApi())
      : import('./supabaseApi').then((m) => m.createSupabaseApi())
  }
  return apiPromise
}
