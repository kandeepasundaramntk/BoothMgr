import type {
  ActionProgressRow,
  ActionStatus,
  Assembly,
  AssemblySummary,
  Booth,
  BoothDetail,
  BoothImportRow,
  BoothListItem,
} from '../types'
import type { DataApi } from './api'
import { getSupabase } from './supabaseClient'

interface CompletionRow {
  booth_id: string
  done_count: number
  in_progress_count: number
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

  async function completionByBooth(assemblyId: string): Promise<Map<string, CompletionRow>> {
    const { data, error } = await db
      .from('booth_completion')
      .select('booth_id, done_count, in_progress_count')
      .eq('assembly_id', assemblyId)
    if (error) fail(error.message)
    return new Map((data as CompletionRow[]).map((r) => [r.booth_id, r]))
  }

  async function boothDetails(booths: Booth[]): Promise<BoothDetail[]> {
    if (booths.length === 0) return []
    const ids = booths.map((b) => b.id)
    const [votes, castes, religions, influencers, actions] = await Promise.all([
      db.from('booth_party_votes').select('booth_id, party_name, votes').in('booth_id', ids),
      db.from('booth_caste_pct').select('booth_id, caste_name, pct').in('booth_id', ids),
      db.from('booth_religion_pct').select('booth_id, religion_name, pct').in('booth_id', ids),
      db.from('booth_influencers').select('booth_id, name, contact, role_note').in('booth_id', ids),
      db.from('booth_actions').select('booth_id, action_id, status, notes').in('booth_id', ids),
    ])
    for (const res of [votes, castes, religions, influencers, actions]) {
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
    const votesMap = byBooth(votes.data)
    const castesMap = byBooth(castes.data)
    const religionsMap = byBooth(religions.data)
    const influencersMap = byBooth(influencers.data)
    const actionsMap = byBooth(actions.data)
    return booths.map((booth) => ({
      booth: { ...booth, committed_pct: numOrNull(booth.committed_pct), swing_pct: numOrNull(booth.swing_pct), opponent_pct: numOrNull(booth.opponent_pct) },
      partyVotes: (votesMap.get(booth.id) ?? []).map((v) => ({ party_name: v.party_name, votes: Number(v.votes) })),
      castes: (castesMap.get(booth.id) ?? []).map((c) => ({ caste_name: c.caste_name, pct: Number(c.pct) })),
      religions: (religionsMap.get(booth.id) ?? []).map((r) => ({ religion_name: r.religion_name, pct: Number(r.pct) })),
      influencers: (influencersMap.get(booth.id) ?? []).map((f) => ({ name: f.name, contact: f.contact, role_note: f.role_note })),
      actions: (actionsMap.get(booth.id) ?? []).map((a) => ({ action_id: a.action_id, status: a.status as ActionStatus, notes: a.notes })),
    }))
  }

  return {
    async listAssemblies(): Promise<Assembly[]> {
      const { data, error } = await db.from('assemblies').select('id, name').order('name')
      if (error) fail(error.message)
      return data as Assembly[]
    },

    async createAssembly(name: string): Promise<void> {
      const { error } = await db.from('assemblies').insert({ name })
      if (error) fail(error.message)
    },

    async listBooths(assemblyId: string): Promise<BoothListItem[]> {
      const [{ data, error }, completion] = await Promise.all([
        db
          .from('booths')
          .select('id, booth_number, village_ward_area, committed_pct')
          .eq('assembly_id', assemblyId),
        completionByBooth(assemblyId),
      ])
      if (error) fail(error.message)
      return (data ?? [])
        .map((b) => ({
          id: b.id as string,
          booth_number: b.booth_number as string,
          village_ward_area: b.village_ward_area as string,
          committed_pct: numOrNull(b.committed_pct),
          done_count: Number(completion.get(b.id as string)?.done_count ?? 0),
          in_progress_count: Number(completion.get(b.id as string)?.in_progress_count ?? 0),
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

    async getBoothDetail(boothId: string): Promise<BoothDetail> {
      const { data, error } = await db.from('booths').select('*').eq('id', boothId).single()
      if (error) fail(error.message)
      const [detail] = await boothDetails([data as Booth])
      return detail
    },

    async saveBoothDetail(detail: BoothDetail): Promise<void> {
      const b = detail.booth
      const { error } = await db
        .from('booths')
        .update({
          booth_number: b.booth_number,
          village_ward_area: b.village_ward_area,
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
        })
        .eq('id', b.id)
      if (error) fail(error.message)

      // Repeating rows are replaced wholesale — simplest way to apply
      // adds/edits/removals from the form in one pass.
      const replace = async (table: string, rows: Record<string, unknown>[]) => {
        const del = await db.from(table).delete().eq('booth_id', b.id)
        if (del.error) fail(del.error.message)
        if (rows.length === 0) return
        const ins = await db.from(table).insert(rows.map((r) => ({ ...r, booth_id: b.id })))
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

    async setActionStatus(boothId: string, actionId: number, status: ActionStatus, notes: string): Promise<void> {
      const { error } = await db
        .from('booth_actions')
        .upsert({ booth_id: boothId, action_id: actionId, status, notes }, { onConflict: 'booth_id,action_id' })
      if (error) fail(error.message)
    },

    async getAssemblySummary(assemblyId: string): Promise<AssemblySummary> {
      const { data, error } = await db
        .from('assembly_health_summary')
        .select('booth_count, avg_committed_pct, avg_swing_pct, avg_opponent_pct')
        .eq('assembly_id', assemblyId)
        .single()
      if (error) fail(error.message)
      return {
        booth_count: Number(data.booth_count),
        avg_committed_pct: numOrNull(data.avg_committed_pct),
        avg_swing_pct: numOrNull(data.avg_swing_pct),
        avg_opponent_pct: numOrNull(data.avg_opponent_pct),
      }
    },

    async getWeakestBooths(assemblyId: string, limit: number): Promise<BoothListItem[]> {
      const [{ data, error }, completion] = await Promise.all([
        db
          .from('booths')
          .select('id, booth_number, village_ward_area, committed_pct')
          .eq('assembly_id', assemblyId)
          .not('committed_pct', 'is', null)
          .order('committed_pct', { ascending: true })
          .limit(limit),
        completionByBooth(assemblyId),
      ])
      if (error) fail(error.message)
      return (data ?? []).map((b) => ({
        id: b.id as string,
        booth_number: b.booth_number as string,
        village_ward_area: b.village_ward_area as string,
        committed_pct: numOrNull(b.committed_pct),
        done_count: Number(completion.get(b.id as string)?.done_count ?? 0),
        in_progress_count: Number(completion.get(b.id as string)?.in_progress_count ?? 0),
      }))
    },

    async getActionProgress(assemblyId: string): Promise<ActionProgressRow[]> {
      const { data, error } = await db
        .from('action_progress')
        .select('action_id, done_count, in_progress_count, not_started_count')
        .eq('assembly_id', assemblyId)
        .order('action_id')
      if (error) fail(error.message)
      return (data ?? []).map((r) => ({
        action_id: Number(r.action_id),
        done_count: Number(r.done_count),
        in_progress_count: Number(r.in_progress_count),
        not_started_count: Number(r.not_started_count),
      }))
    },

    async getAssemblyExport(assemblyId: string): Promise<BoothDetail[]> {
      const { data, error } = await db.from('booths').select('*').eq('assembly_id', assemblyId)
      if (error) fail(error.message)
      const booths = ((data ?? []) as Booth[]).sort((a, b) => boothNumberCompare(a.booth_number, b.booth_number))
      return boothDetails(booths)
    },
  }
}
