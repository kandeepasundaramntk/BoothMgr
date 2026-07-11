/** Human-readable labels for activity_log rows — mirrors the shape of ../data/roles.ts's ROLE_LABEL. */

const TABLE_LABEL: Record<string, { ta: string; en: string }> = {
  assemblies: { ta: 'தொகுதிகள்', en: 'Assemblies' },
  booths: { ta: 'பூத்கள்', en: 'Booths' },
  booth_party_votes: { ta: 'கட்சி வாக்குகள்', en: 'Party votes' },
  booth_caste_pct: { ta: 'சாதி விகிதம்', en: 'Caste %' },
  booth_religion_pct: { ta: 'மத விகிதம்', en: 'Religion %' },
  booth_influencers: { ta: 'செல்வாக்குமிக்கோர்', en: 'Influencers' },
  booth_actions: { ta: 'பூத் நடவடிக்கைகள்', en: 'Booth actions' },
  profiles: { ta: 'பயனர் சுயவிவரங்கள்', en: 'Profiles' },
}

const OP_LABEL: Record<string, { ta: string; en: string }> = {
  insert: { ta: 'உருவாக்கம்', en: 'Created' },
  update: { ta: 'திருத்தம்', en: 'Updated' },
  delete: { ta: 'நீக்கம்', en: 'Deleted' },
}

/** The curated, non-generic summary events emitted by the superadmin RPCs and view-as. */
export const SUMMARY_ACTION_LABEL: Record<string, { ta: string; en: string }> = {
  'backup.restore': { ta: 'காப்பு மீட்பு', en: 'Backup restored' },
  'data.clear_assembly': { ta: 'தொகுதி தரவு அழிப்பு', en: 'Assembly data cleared' },
  'data.clear_all': { ta: 'அனைத்து தரவும் அழிப்பு', en: 'All data cleared' },
  'assemblies.bulk_create': { ta: 'தொகுதிகள் தொகுப்பாக சேர்க்கப்பட்டன', en: 'Assemblies bulk-created' },
  'view_as.start': { ta: 'பார்வையிடத் தொடங்கியது', en: 'View-as started' },
  'view_as.end': { ta: 'பார்வையிடல் முடிந்தது', en: 'View-as ended' },
}

/** Every action_type value the app can produce — the 6 curated summaries plus every table x op combination the generic trigger can log. */
export const ACTIVITY_ACTION_TYPES: string[] = [
  ...Object.keys(SUMMARY_ACTION_LABEL),
  ...Object.keys(TABLE_LABEL).flatMap((table) => Object.keys(OP_LABEL).map((op) => `${table}.${op}`)),
]

export function describeActionType(actionType: string): { ta: string; en: string } {
  const summary = SUMMARY_ACTION_LABEL[actionType]
  if (summary) return summary
  const [table, op] = actionType.split('.')
  const tableLabel = TABLE_LABEL[table]
  const opLabel = OP_LABEL[op]
  if (tableLabel && opLabel) {
    return { ta: `${tableLabel.ta} — ${opLabel.ta}`, en: `${tableLabel.en} — ${opLabel.en}` }
  }
  return { ta: actionType, en: actionType }
}
