import type {
  ActionProgressRow,
  ActionStatus,
  ActivityLogEntry,
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
  Election,
  ParliamentConstituency,
  PcSummary,
  Profile,
  RestoreResult,
  UserRole,
} from '../types'
import type { DataApi } from './api'
import { getSupabase } from './supabaseClient'

interface CompletionRow {
  booth_id: string
  done_count: number
  in_progress_count: number
}

/** Geography-only booth shape (campaign scalars moved to election_booths in 0009). */
interface BoothGeo {
  id: string
  assembly_id: string
  booth_number: string
  village_ward_area: string
}

/** One election_booths row (per-(election, booth) campaign scalars). */
interface ElectionBoothRow {
  booth_id: string
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

function fail(message: string): never {
  throw new Error(message)
}

/** booth_number is text; sort "2" before "10". */
function boothNumberCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

export function createSupabaseApi(): DataApi {
  const db = getSupabase()

  async function completionByBooth(assemblyId: string, electionId: string): Promise<Map<string, CompletionRow>> {
    const { data, error } = await db
      .from('booth_completion')
      .select('booth_id, done_count, in_progress_count')
      .eq('assembly_id', assemblyId)
      .eq('election_id', electionId)
    if (error) fail(error.message)
    return new Map((data as CompletionRow[]).map((r) => [r.booth_id, r]))
  }

  async function boothDetails(booths: BoothGeo[], electionId: string): Promise<BoothDetail[]> {
    if (booths.length === 0) return []
    const ids = booths.map((b) => b.id)
    // Campaign scalars (election_booths) and the five child tables are all
    // election-scoped (0009) — a booth may have no rows for this election yet.
    const [electionBooths, votes, castes, religions, influencers, actions] = await Promise.all([
      db
        .from('election_booths')
        .select(
          'booth_id, committed_pct, swing_pct, opponent_pct, macro_trends, alliance_dynamics, candidate_selection, media_narrative, anti_incumbency, beneficiary_mapping, long_pending_issues',
        )
        .eq('election_id', electionId)
        .in('booth_id', ids),
      db.from('booth_party_votes').select('booth_id, party_name, votes').eq('election_id', electionId).in('booth_id', ids),
      db.from('booth_caste_pct').select('booth_id, caste_name, pct').eq('election_id', electionId).in('booth_id', ids),
      db.from('booth_religion_pct').select('booth_id, religion_name, pct').eq('election_id', electionId).in('booth_id', ids),
      db.from('booth_influencers').select('booth_id, name, contact, role_note').eq('election_id', electionId).in('booth_id', ids),
      db.from('booth_actions').select('booth_id, action_id, status, notes').eq('election_id', electionId).in('booth_id', ids),
    ])
    for (const res of [electionBooths, votes, castes, religions, influencers, actions]) {
      if (res.error) fail(res.error.message)
    }
    const byBooth = <T extends { booth_id: string }>(rows: T[] | null) => {
      const map = new Map<string, T[]>()
      for (const row of rows ?? []) {
        const list = map.get(row.booth_id) ?? []
        list.push(row)
        map.set(row.booth_id, list)
      }
      return map
    }
    const ebByBooth = new Map(
      ((electionBooths.data ?? []) as ElectionBoothRow[]).map((r) => [r.booth_id, r]),
    )
    const votesMap = byBooth(votes.data)
    const castesMap = byBooth(castes.data)
    const religionsMap = byBooth(religions.data)
    const influencersMap = byBooth(influencers.data)
    const actionsMap = byBooth(actions.data)
    return booths.map((booth) => {
      const eb = ebByBooth.get(booth.id)
      return {
        // A missing election_booths row means no campaign data for this cycle
        // yet — default every scalar the same way lazily-created rows default.
        booth: {
          id: booth.id,
          assembly_id: booth.assembly_id,
          booth_number: booth.booth_number,
          village_ward_area: booth.village_ward_area,
          committed_pct: numOrNull(eb?.committed_pct),
          swing_pct: numOrNull(eb?.swing_pct),
          opponent_pct: numOrNull(eb?.opponent_pct),
          macro_trends: eb?.macro_trends ?? '',
          alliance_dynamics: eb?.alliance_dynamics ?? '',
          candidate_selection: eb?.candidate_selection ?? '',
          media_narrative: eb?.media_narrative ?? '',
          anti_incumbency: eb?.anti_incumbency ?? '',
          beneficiary_mapping: eb?.beneficiary_mapping ?? '',
          long_pending_issues: eb?.long_pending_issues ?? '',
        },
        partyVotes: (votesMap.get(booth.id) ?? []).map((v) => ({ party_name: v.party_name, votes: Number(v.votes) })),
        castes: (castesMap.get(booth.id) ?? []).map((c) => ({ caste_name: c.caste_name, pct: Number(c.pct) })),
        religions: (religionsMap.get(booth.id) ?? []).map((r) => ({ religion_name: r.religion_name, pct: Number(r.pct) })),
        influencers: (influencersMap.get(booth.id) ?? []).map((f) => ({ name: f.name, contact: f.contact, role_note: f.role_note })),
        actions: (actionsMap.get(booth.id) ?? []).map((a) => ({ action_id: a.action_id, status: a.status as ActionStatus, notes: a.notes })),
      }
    })
  }

  return {
    async listAssemblies(): Promise<Assembly[]> {
      const { data, error } = await db
        .from('assemblies')
        .select('id, name, parliament_constituency_id, constituency_code, district, state_code')
        .order('name')
      if (error) fail(error.message)
      return data as Assembly[]
    },

    async createAssembly(input: {
      name: string
      parliament_constituency_id?: string | null
      constituency_code?: string
      district?: string
      state_code?: string
    }): Promise<void> {
      const { error } = await db.from('assemblies').insert({
        name: input.name,
        parliament_constituency_id: input.parliament_constituency_id ?? null,
        constituency_code: input.constituency_code ?? '',
        district: input.district ?? '',
        state_code: input.state_code ?? 'TN',
      })
      if (error) fail(error.message)
    },

    async updateAssembly(
      id: string,
      patch: Partial<Pick<Assembly, 'parliament_constituency_id' | 'constituency_code' | 'district' | 'state_code'>>,
    ): Promise<void> {
      const { error } = await db.from('assemblies').update(patch).eq('id', id)
      if (error) fail(error.message)
    },

    async listParliamentConstituencies(): Promise<ParliamentConstituency[]> {
      const { data, error } = await db.from('parliament_constituencies').select('*').order('name')
      if (error) fail(error.message)
      return data as ParliamentConstituency[]
    },

    async createParliamentConstituency(input: { name: string; pc_code?: string; state_code?: string }): Promise<void> {
      const { error } = await db.from('parliament_constituencies').insert({
        name: input.name,
        pc_code: input.pc_code ?? '',
        state_code: input.state_code ?? 'TN',
      })
      if (error) fail(error.message)
    },

    async listElections(): Promise<Election[]> {
      const { data, error } = await db.from('elections').select('*').order('year', { ascending: false })
      if (error) fail(error.message)
      return data as Election[]
    },

    async createElection(input: { name: string; year: number }): Promise<void> {
      const { error } = await db.from('elections').insert({ name: input.name, year: input.year })
      if (error) fail(error.message)
    },

    async setElectionStatus(id: string, status: Election['status']): Promise<void> {
      const { error } = await db.from('elections').update({ status }).eq('id', id)
      if (error) fail(error.message)
    },

    async listBooths(assemblyId: string, electionId: string): Promise<BoothListItem[]> {
      // committed_pct moved to election_booths (0009). Left-embed it, filtered
      // to this election — booths with no row for this cycle come back with an
      // empty election_booths array (committed_pct null), not dropped.
      const [{ data, error }, completion] = await Promise.all([
        db
          .from('booths')
          .select('id, booth_number, village_ward_area, election_booths(committed_pct)')
          .eq('assembly_id', assemblyId)
          .eq('election_booths.election_id', electionId),
        completionByBooth(assemblyId, electionId),
      ])
      if (error) fail(error.message)
      return ((data ?? []) as { id: string; booth_number: string; village_ward_area: string; election_booths: { committed_pct: number | null }[] }[])
        .map((b) => ({
          id: b.id,
          booth_number: b.booth_number,
          village_ward_area: b.village_ward_area,
          committed_pct: numOrNull(b.election_booths?.[0]?.committed_pct),
          done_count: Number(completion.get(b.id)?.done_count ?? 0),
          in_progress_count: Number(completion.get(b.id)?.in_progress_count ?? 0),
        }))
        .sort((a, b) => boothNumberCompare(a.booth_number, b.booth_number))
    },

    async importBooths(assemblyId: string, rows: BoothImportRow[]): Promise<number> {
      const { data, error } = await db.from('booths').select('booth_number').eq('assembly_id', assemblyId)
      if (error) fail(error.message)
      const existing = new Set((data ?? []).map((b) => b.booth_number as string))
      const seen = new Set<string>()
      const fresh = rows.filter((r) => {
        if (existing.has(r.booth_number) || seen.has(r.booth_number)) return false
        seen.add(r.booth_number)
        return true
      })
      if (fresh.length === 0) return 0
      const { error: insertError } = await db.from('booths').insert(
        fresh.map((r) => ({
          assembly_id: assemblyId,
          booth_number: r.booth_number,
          village_ward_area: r.village_ward_area,
        })),
      )
      if (insertError) fail(insertError.message)
      return fresh.length
    },

    async createBooth(assemblyId: string, boothNumber: string, villageWardArea: string): Promise<string> {
      const { data, error } = await db
        .from('booths')
        .insert({ assembly_id: assemblyId, booth_number: boothNumber, village_ward_area: villageWardArea })
        .select('id')
        .single()
      if (error) fail(error.message)
      return data.id as string
    },

    async getBoothDetail(boothId: string, electionId: string): Promise<BoothDetail> {
      const { data, error } = await db
        .from('booths')
        .select('id, assembly_id, booth_number, village_ward_area')
        .eq('id', boothId)
        .single()
      if (error) fail(error.message)
      const [detail] = await boothDetails([data as BoothGeo], electionId)
      return detail
    },

    async saveBoothDetail(detail: BoothDetail, electionId: string): Promise<void> {
      const b = detail.booth
      // Geography stays on booths...
      const geo = await db
        .from('booths')
        .update({ booth_number: b.booth_number, village_ward_area: b.village_ward_area })
        .eq('id', b.id)
      if (geo.error) fail(geo.error.message)

      // ...campaign scalars live on election_booths, whose row may not exist
      // for this cycle yet — upsert on the (election_id, booth_id) unique key.
      const eb = await db.from('election_booths').upsert(
        {
          election_id: electionId,
          booth_id: b.id,
          committed_pct: b.committed_pct,
          swing_pct: b.swing_pct,
          opponent_pct: b.opponent_pct,
          macro_trends: b.macro_trends,
          alliance_dynamics: b.alliance_dynamics,
          candidate_selection: b.candidate_selection,
          media_narrative: b.media_narrative,
          anti_incumbency: b.anti_incumbency,
          beneficiary_mapping: b.beneficiary_mapping,
          long_pending_issues: b.long_pending_issues,
        },
        { onConflict: 'election_id,booth_id' },
      )
      if (eb.error) fail(eb.error.message)

      // Repeating rows are replaced wholesale — simplest way to apply
      // adds/edits/removals from the form in one pass. Scoped to THIS election
      // so other cycles' child rows for the same booth are left intact.
      const replace = async (table: string, rows: Record<string, unknown>[]) => {
        const del = await db.from(table).delete().eq('booth_id', b.id).eq('election_id', electionId)
        if (del.error) fail(del.error.message)
        if (rows.length === 0) return
        const ins = await db.from(table).insert(rows.map((r) => ({ ...r, booth_id: b.id, election_id: electionId })))
        if (ins.error) fail(ins.error.message)
      }
      await replace(
        'booth_party_votes',
        detail.partyVotes.filter((v) => v.party_name.trim()).map((v) => ({ party_name: v.party_name, votes: v.votes || 0 })),
      )
      await replace(
        'booth_caste_pct',
        detail.castes.filter((c) => c.caste_name.trim()).map((c) => ({ caste_name: c.caste_name, pct: c.pct || 0 })),
      )
      await replace(
        'booth_religion_pct',
        detail.religions.filter((r) => r.religion_name.trim()).map((r) => ({ religion_name: r.religion_name, pct: r.pct || 0 })),
      )
      await replace(
        'booth_influencers',
        detail.influencers
          .filter((f) => f.name.trim() || f.contact.trim())
          .map((f) => ({ name: f.name, contact: f.contact, role_note: f.role_note })),
      )
    },

    async setActionStatus(boothId: string, electionId: string, actionId: number, status: ActionStatus, notes: string): Promise<void> {
      const { data: session } = await db.auth.getSession()
      const { error } = await db
        .from('booth_actions')
        .upsert(
          { booth_id: boothId, election_id: electionId, action_id: actionId, status, notes, updated_by: session.session?.user.id ?? null },
          { onConflict: 'election_id,booth_id,action_id' },
        )
      if (error) fail(error.message)
    },

    async getAssemblySummary(assemblyId: string, electionId: string): Promise<AssemblySummary> {
      const { data, error } = await db
        .from('assembly_health_summary')
        .select('booth_count, avg_committed_pct, avg_swing_pct, avg_opponent_pct')
        .eq('assembly_id', assemblyId)
        .eq('election_id', electionId)
        .single()
      if (error) fail(error.message)
      return {
        booth_count: Number(data.booth_count),
        avg_committed_pct: numOrNull(data.avg_committed_pct),
        avg_swing_pct: numOrNull(data.avg_swing_pct),
        avg_opponent_pct: numOrNull(data.avg_opponent_pct),
      }
    },

    async getWeakestBooths(assemblyId: string, electionId: string, limit: number): Promise<BoothListItem[]> {
      // committed_pct lives on election_booths now — drive the query from there
      // (inner-joining booths to scope by assembly) so ordering/limit apply to
      // the score column directly.
      const [{ data, error }, completion] = await Promise.all([
        db
          .from('election_booths')
          .select('booth_id, committed_pct, booths!inner(booth_number, village_ward_area, assembly_id)')
          .eq('election_id', electionId)
          .eq('booths.assembly_id', assemblyId)
          .not('committed_pct', 'is', null)
          .order('committed_pct', { ascending: true })
          .limit(limit),
        completionByBooth(assemblyId, electionId),
      ])
      if (error) fail(error.message)
      // booths is a many-to-one embed → one object per row; supabase-js infers
      // it as an array, so cast through unknown to the actual runtime shape.
      return ((data ?? []) as unknown as { booth_id: string; committed_pct: number | null; booths: { booth_number: string; village_ward_area: string } }[]).map((r) => ({
        id: r.booth_id,
        booth_number: r.booths.booth_number,
        village_ward_area: r.booths.village_ward_area,
        committed_pct: numOrNull(r.committed_pct),
        done_count: Number(completion.get(r.booth_id)?.done_count ?? 0),
        in_progress_count: Number(completion.get(r.booth_id)?.in_progress_count ?? 0),
      }))
    },

    async getActionProgress(assemblyId: string, electionId: string): Promise<ActionProgressRow[]> {
      const { data, error } = await db
        .from('action_progress')
        .select('action_id, done_count, in_progress_count, not_started_count')
        .eq('assembly_id', assemblyId)
        .eq('election_id', electionId)
        .order('action_id')
      if (error) fail(error.message)
      return (data ?? []).map((r) => ({
        action_id: Number(r.action_id),
        done_count: Number(r.done_count),
        in_progress_count: Number(r.in_progress_count),
        not_started_count: Number(r.not_started_count),
      }))
    },

    async getAssemblyExport(assemblyId: string, electionId: string): Promise<BoothDetail[]> {
      const { data, error } = await db
        .from('booths')
        .select('id, assembly_id, booth_number, village_ward_area')
        .eq('assembly_id', assemblyId)
      if (error) fail(error.message)
      const booths = ((data ?? []) as BoothGeo[]).sort((a, b) => boothNumberCompare(a.booth_number, b.booth_number))
      return boothDetails(booths, electionId)
    },

    async listAssemblySummaries(electionId: string): Promise<(AssemblySummary & { assembly_id: string })[]> {
      const { data, error } = await db
        .from('assembly_health_summary')
        .select('assembly_id, booth_count, avg_committed_pct, avg_swing_pct, avg_opponent_pct')
        .eq('election_id', electionId)
      if (error) fail(error.message)
      return (data ?? []).map((r) => ({
        assembly_id: r.assembly_id as string,
        booth_count: Number(r.booth_count),
        avg_committed_pct: numOrNull(r.avg_committed_pct),
        avg_swing_pct: numOrNull(r.avg_swing_pct),
        avg_opponent_pct: numOrNull(r.avg_opponent_pct),
      }))
    },

    async getPcSummary(pcId: string, electionId: string): Promise<PcSummary> {
      const { data, error } = await db
        .from('pc_health_summary')
        .select('assembly_count, booth_count, avg_committed_pct, avg_swing_pct, avg_opponent_pct')
        .eq('parliament_constituency_id', pcId)
        .eq('election_id', electionId)
        .single()
      if (error) fail(error.message)
      return {
        assembly_count: Number(data.assembly_count),
        booth_count: Number(data.booth_count),
        avg_committed_pct: numOrNull(data.avg_committed_pct),
        avg_swing_pct: numOrNull(data.avg_swing_pct),
        avg_opponent_pct: numOrNull(data.avg_opponent_pct),
      }
    },

    async getMyProfile(): Promise<Profile | null> {
      const { data: session } = await db.auth.getSession()
      const userId = session.session?.user.id
      if (!userId) return null
      const { data, error } = await db
        .from('profiles')
        .select('id, email, full_name, phone, role, status, assembly_id, created_at, approved_at, approved_by')
        .eq('id', userId)
        .maybeSingle()
      if (error) fail(error.message)
      return (data as Profile | null) ?? null
    },

    async listSignupAssemblies(): Promise<Assembly[]> {
      const { data, error } = await db.rpc('signup_assemblies')
      if (error) fail(error.message)
      return (data ?? []) as Assembly[]
    },

    async listProfiles(): Promise<Profile[]> {
      const { data, error } = await db
        .from('profiles')
        .select('id, email, full_name, phone, role, status, assembly_id, created_at, approved_at, approved_by')
        .order('created_at')
      if (error) fail(error.message)
      return (data ?? []) as Profile[]
    },

    async approveProfile(userId: string): Promise<void> {
      const { error } = await db.rpc('approve_user', { target: userId })
      if (error) fail(error.message)
    },

    async rejectProfile(userId: string): Promise<void> {
      const { error } = await db.rpc('reject_user', { target: userId })
      if (error) fail(error.message)
    },

    async setProfileRole(userId: string, role: UserRole): Promise<void> {
      const { error } = await db.rpc('set_user_role', { target: userId, new_role: role })
      if (error) fail(error.message)
    },

    async getActivityLog(filter: ActivityLogFilter): Promise<ActivityLogPage> {
      let q = db.from('activity_log').select('*', { count: 'exact' }).order('created_at', { ascending: false })
      if (filter.assemblyId) q = q.eq('assembly_id', filter.assemblyId)
      if (filter.actorId) q = q.eq('actor_id', filter.actorId)
      if (filter.actionType) q = q.eq('action_type', filter.actionType)
      if (filter.dateFrom) q = q.gte('created_at', filter.dateFrom)
      if (filter.dateTo) q = q.lte('created_at', filter.dateTo)
      const { data, error, count } = await q.range(filter.offset, filter.offset + filter.limit - 1)
      if (error) fail(error.message)
      return { rows: (data ?? []) as ActivityLogEntry[], totalCount: count ?? 0 }
    },

    async logViewAs(action: 'start' | 'end', targetProfile: Profile): Promise<void> {
      const { error } = await db.rpc('log_view_as', { p_target: targetProfile.id, p_action: action })
      if (error) fail(error.message)
    },

    async restoreAssemblyBackup(assemblyId: string, electionId: string, backup: AssemblyBackup): Promise<RestoreResult> {
      // 0010's signature is (p_assembly_id, p_election_id, p_payload). The RPC
      // derives everything from p_election_id server-side and reads only
      // format_version / exported_at / booths from the payload, so the backup's
      // own `election` metadata is passed along in-payload but not separately.
      const { data, error } = await db.rpc('restore_assembly_backup', {
        p_assembly_id: assemblyId,
        p_election_id: electionId,
        p_payload: backup,
      })
      if (error) fail(error.message)
      return data as RestoreResult
    },

    async bulkCreateAssemblies(rows: BulkAssemblyUploadRow[]): Promise<BulkAssemblyUploadResult> {
      const { data, error } = await db.rpc('bulk_create_assemblies', { p_payload: rows })
      if (error) fail(error.message)
      return data as BulkAssemblyUploadResult
    },

    async clearAssemblyData(assemblyId: string): Promise<number> {
      const { data, error } = await db.rpc('clear_assembly_data', { p_assembly_id: assemblyId })
      if (error) fail(error.message)
      return Number(data)
    },

    async clearAllData(): Promise<number> {
      const { data, error } = await db.rpc('clear_all_data')
      if (error) fail(error.message)
      return Number(data)
    },

    async clearAssemblyElectionData(assemblyId: string, electionId: string): Promise<number> {
      const { data, error } = await db.rpc('clear_assembly_election_data', {
        p_assembly_id: assemblyId,
        p_election_id: electionId,
      })
      if (error) fail(error.message)
      return Number(data)
    },

    async clearElectionData(electionId: string): Promise<number> {
      const { data, error } = await db.rpc('clear_election_data', { p_election_id: electionId })
      if (error) fail(error.message)
      return Number(data)
    },
  }
}
