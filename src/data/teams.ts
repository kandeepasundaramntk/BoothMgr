/**
 * Team categorization: which team owns each booth-form field and each of the
 * 21 actions (see docs/superpowers/specs/2026-07-09-team-categorization-design.md).
 * App-only metadata — lives here, not in the database.
 */
export type Team = 'poc' | 'itw' | 'both'

/** Filter choices offered in the UI ('both' items always pass a team filter). */
export type TeamFilter = 'all' | 'poc' | 'itw'

export const TEAM_LABEL: Record<Team, { ta: string; en: string }> = {
  poc: { ta: 'தொகுதி பொறுப்பாளர்', en: 'Assembly POC' },
  itw: { ta: 'இணையக் குழு', en: 'IT Wing' },
  both: { ta: 'இரு அணி', en: 'Both' },
}

export function matchesTeam(team: Team, filter: TeamFilter): boolean {
  return filter === 'all' || team === filter || team === 'both'
}

/** Section 1 fields of the booth form. Booth number / village are
 * uncategorized header fields and always visible. */
export type BoothFieldKey =
  | 'party_votes'
  | 'castes'
  | 'religions'
  | 'influencers'
  | 'macro_trends'
  | 'long_pending_issues'
  | 'alliance_dynamics'
  | 'candidate_selection'
  | 'media_narrative'
  | 'anti_incumbency'
  | 'beneficiary_mapping'

export const FIELD_TEAM: Record<BoothFieldKey, Team> = {
  party_votes: 'itw',
  castes: 'poc',
  religions: 'poc',
  influencers: 'poc',
  beneficiary_mapping: 'poc',
  macro_trends: 'poc',
  long_pending_issues: 'poc',
  candidate_selection: 'poc',
  media_narrative: 'itw',
  alliance_dynamics: 'both',
  anti_incumbency: 'both',
}
