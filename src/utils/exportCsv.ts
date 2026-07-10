import Papa from 'papaparse'
import { ACTIONS } from '../data/actionsCatalog'
import { getApi } from '../data/api'
import { TEAM_LABEL } from '../data/teams'
import type { ActionStatus } from '../types'
import { downloadBlob, safeFilenamePart } from './download'

const STATUS_LABEL: Record<ActionStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
}

// Prevents CSV/formula injection: a cell starting with =, +, -, @, tab, or CR
// is interpreted as a formula by Excel/Sheets when the file is opened. Since
// several columns hold free-text user input, prefix such cells with a
// leading apostrophe so spreadsheet apps treat them as literal text.
function csvSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/**
 * Exports one assembly as CSV. The first 14 columns match the requirements
 * spreadsheet ("Booth level details" sheet) so the file round-trips to Excel;
 * health score and the 21 action statuses are appended after.
 */
export async function exportAssemblyCsv(assemblyId: string, assemblyName: string): Promise<void> {
  const api = await getApi()
  const details = await api.getAssemblyExport(assemblyId)

  const rows = details.map((d, i) => {
    const row: Record<string, string> = {
      'Sl. No.': String(i + 1),
      'Assembly Name': assemblyName,
      'Booth Number': d.booth.booth_number,
      'Village / Ward / area': d.booth.village_ward_area,
      '2026 - polled votes / party wise': d.partyVotes.map((v) => `${v.party_name}: ${v.votes}`).join('; '),
      '% of Caste': d.castes.map((c) => `${c.caste_name}: ${c.pct}%`).join('; '),
      '% of religion': d.religions.map((r) => `${r.religion_name}: ${r.pct}%`).join('; '),
      'Micro-Influencer Name & Contact details': d.influencers
        .map((f) => [f.name, f.contact, f.role_note].filter(Boolean).join(' – '))
        .join('; '),
      'Macro Socioeconomic Trends': d.booth.macro_trends,
      'Alliance Dynamics & Vote Splitters': d.booth.alliance_dynamics,
      'Candidate Selection': d.booth.candidate_selection,
      'Media Narrative': d.booth.media_narrative,
      'Anti-Incumbency': d.booth.anti_incumbency,
      'Beneficiary Mapping': d.booth.beneficiary_mapping,
      'Long Pending Issues': d.booth.long_pending_issues,
      'Committed %': d.booth.committed_pct?.toString() ?? '',
      'Swing %': d.booth.swing_pct?.toString() ?? '',
      'Opponent %': d.booth.opponent_pct?.toString() ?? '',
    }
    for (const action of ACTIONS) {
      const st = d.actions.find((a) => a.action_id === action.id)
      row[`${action.id}. ${action.title_en} (${TEAM_LABEL[action.team].en})`] = st
        ? STATUS_LABEL[st.status]
        : STATUS_LABEL.not_started
    }
    for (const key of Object.keys(row)) {
      row[key] = csvSafe(row[key])
    }
    return row
  })

  const csv = Papa.unparse(rows)
  // BOM so Excel opens the Tamil text as UTF-8
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, `boothmgr-${safeFilenamePart(assemblyName)}-${new Date().toISOString().slice(0, 10)}.csv`)
}
