import type {
  ActionProgressRow,
  ActionStatus,
  Assembly,
  AssemblySummary,
  BoothDetail,
  BoothImportRow,
  BoothListItem,
} from '../types'

/**
 * Every page talks to the backend through this interface — never call
 * Supabase directly from a page. getApi() picks the implementation:
 * demoApi (localStorage) when VITE_DEMO=1, supabaseApi otherwise.
 */
export interface DataApi {
  listAssemblies(): Promise<Assembly[]>
  createAssembly(name: string): Promise<void>
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
