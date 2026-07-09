# Team Categorization: Assembly POC / IT Wing

Date: 2026-07-09 · Status: approved by user

## Goal

Mirror the paper-form split in the app: every Section 1 detail field and every
one of the 21 booth-level actions belongs to Assembly POC (தொகுதி பொறுப்பாளர்),
IT Wing (இணையக் குழு), or Both (இரு அணி). Each team can filter to its own work.
Also add the "Long Pending Issues" field that exists on the Assembly POC paper
form but not in the app.

## Team model (Approach A: TypeScript catalog only)

New `src/data/teams.ts`:

- `type Team = 'poc' | 'itw' | 'both'`
- `TEAM_LABEL: Record<Team, { ta: string; en: string }>` —
  poc: தொகுதி பொறுப்பாளர் / Assembly POC; itw: இணையக் குழு / IT Wing;
  both: இரு அணி / Both
- `FIELD_TEAM` map for Section 1 fields (below)
- `matchesTeam(team, filter)` helper: `filter === 'all' || team === filter || team === 'both'`

`ActionDef` in `actionsCatalog.ts` gains `team: Team`. No DB column for teams —
the app renders action metadata from the TS catalog only. (Revisit with a
one-line migration if SQL-side per-team reporting is ever needed.)

### Action assignments (from the requirements sheet shading)

- **poc (12, green):** 2 Micro-Demographics, 3 Micro-Influencer Alignment,
  4 Beneficiary Mapping, 5 Page Committee Network, 6 Macro Socioeconomic
  Trends, 7 Alliance Dynamics & Vote Splitters, 8 Candidate Selection,
  10 Booth Health Score, 15 Youth Conversion, 19 Regional Influencer
  Matrices, 20 Candidate Viability Index, 21 Anti-Incumbency Vulnerability
- **itw (7, grey):** 1 Voter Turnout, 9 Media Narrative, 11 Displacement
  Velocity, 14 Beneficiary Follow-up & Mapping, 16 Digital War Room,
  17 Vote Splitter Factor, 18 Real-time LLM Sentiment Monitoring
- **both (2, red):** 12 Micro-Auditing 1:1, 13 Algorithmic WhatsApp Clusters

### Section 1 field assignments (user's per-column answers)

- **poc:** % of caste, % of religion, micro-influencers, beneficiary mapping,
  macro socioeconomic trends, long pending issues (new), candidate selection
- **itw:** 2026 party-wise polled votes, media narrative
- **both:** alliance dynamics & vote splitters, anti-incumbency
- Booth number and village/ward/area stay uncategorized header fields,
  always visible regardless of filter.

## Schema change

Migration `0003_long_pending_issues.sql`:
`alter table booths add column long_pending_issues text not null default ''`.

Mirrored in `types.ts` (`Booth.long_pending_issues: string`), `supabaseApi`
save/load, `demoApi`, booth form (POC-tagged textarea after Macro Trends),
print view, CSV export. `demoApi.load()` normalizes older localStorage stores:
missing key → `''`.

## UI

- **Booth page:** filter chips அனைத்தும் (All) / Assembly POC / IT Wing at the
  top; local component state, default All. A team filter shows that team's
  items plus `both` items, in both Section 1 and the action checklist.
  Original field order and 1–21 action numbering preserved. Every field label
  and action title gets a small text badge (text always present — never
  color-alone): light green = POC, light grey = IT Wing, light amber = Both.
- **Dashboard:** same filter chips above the action-progress table; team badge
  in each action row. Summary tiles and weakest-booths list unchanged.
- **Print view:** three subsections — Assembly POC, IT Wing, இரு அணி (Both) —
  each listing its fields then its actions, so shared items print once.
- **CSV export:** new `Long Pending Issues` column after `Beneficiary
  Mapping`; action column headers gain the team, e.g. `1. Voter Turnout
  (IT Wing)`.

## Verification

Demo-mode browser drive (see `.claude/skills/verify/SKILL.md`): chips filter
correctly on booth page and dashboard; badges match the assignment lists;
long pending issues saves and survives reload; print grouping renders;
`npm run build` and `npm run lint` pass.
