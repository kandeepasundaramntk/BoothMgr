import { getApi } from '../data/api'
import type { Assembly, AssemblyBackup } from '../types'
import { downloadBlob, safeFilenamePart } from './download'

/**
 * Downloads a full per-assembly backup as JSON (every booth + child row via
 * the same getAssemblyExport used by CSV export). Carries the same
 * sensitive fields the CSV export already carries — caste/religion %,
 * influencer contacts, beneficiary text — handle the downloaded file with
 * the same care (never commit, don't leave lying around).
 */
export async function exportAssemblyBackup(
  assembly: Assembly,
  election: { id: string; name: string; year: number },
): Promise<void> {
  const api = await getApi()
  const booths = await api.getAssemblyExport(assembly.id, election.id)
  const backup: AssemblyBackup = {
    format_version: 2,
    exported_at: new Date().toISOString(),
    election,
    assembly,
    booths,
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  downloadBlob(
    blob,
    `boothmgr-${safeFilenamePart(assembly.name)}-${safeFilenamePart(election.name)}-${election.year}-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`,
  )
}
