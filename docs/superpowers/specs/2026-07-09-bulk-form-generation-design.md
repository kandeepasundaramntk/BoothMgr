# Bulk Per-Team Form Generation (.docx)

Date: 2026-07-09 · Status: approved by user

## Goal

From the booth list page, generate the per-team paper booth forms
(Assembly POC / IT Wing — same layout as the hand-made
`Booth-Form-Assembly-POC.docx` / `Booth-Form-ITWing.docx`) for all or
selected booths of an assembly, as downloadable Word files.

## UX (booth list page)

- New checkbox column; header checkbox = select all. Default: all selected.
- New **படிவங்கள் / Forms** button next to CSV Export opens an inline panel:
  - அணி (Team): ☑ Assembly POC ☑ IT Wing — both default checked
  - உள்ளடக்கம் (Content): ○ blank forms (default) ○ pre-filled with app data
  - Generate button labeled with the selected-booth count
- Output: one combined .docx per selected team, one booth per page
  (docx section per booth = page break), named like the CSV export:
  `boothmgr-<assembly>-Assembly-POC-forms-<date>.docx` /
  `boothmgr-<assembly>-IT-Wing-forms-<date>.docx`. When both teams are
  selected the two files ship inside a single .zip — browsers drop the
  second of two programmatic downloads (the user gesture is spent on the
  first), which verification confirmed.

## Form layout (mirrors the hand-made docx forms)

Per booth page: title (நாம் தமிழர் கட்சி — பூத் மட்ட விவரப் படிவம்), team
subtitle, election line, header table (Sl. No. = position in the generated
set, assembly, booth number, village, filled-by, date — booth identity
pre-filled in both modes), numbered fields, signature line.

- **Assembly POC (9 fields):** caste % (table), religion % (table),
  influencers (name/role/contact table), beneficiary mapping (scheme/count/
  notes table), macro trends (lines), long pending issues (lines),
  candidate selection (lines), alliance dynamics (lines), anti-incumbency
  (lines)
- **IT Wing (4 fields):** 2026 party-wise polled votes (table), media
  narrative (lines), alliance dynamics (lines), anti-incumbency (lines)

Shared fields (alliance, anti-incumbency) appear on both forms, matching
`FIELD_TEAM`.

**Blank mode:** empty table rows / underscore writing lines.
**Pre-filled mode:** app data via `getAssemblyExport` — table fields get
data rows plus two empty rows; free-text fields print the stored text (or
—) plus two blank lines. Beneficiary mapping is free text in the app, so
in pre-filled mode it renders as text + lines instead of the blank table.

## Implementation

- New dependency: `docx` (docx.js), loaded via dynamic `import()` inside
  the generator so the main bundle is unaffected.
- `src/utils/generateForms.ts` — pure generator:
  `generateTeamForms({ assemblyName, details, teams, prefilled })`;
  takes `BoothDetail[]` (already filtered/ordered), builds one Document
  per team, downloads via Blob anchor (300 ms apart for two files).
- Tamil font: Nirmala UI as the document default run font; `#b71c1c`
  accent for titles/field numbers, consistent with the app and paper form.
- BoothListPage: selection state kept as an "unselected ids" set so the
  default is all-selected without effect syncing; checkbox clicks
  stopPropagation (rows navigate on click).

## Privacy

Pre-filled files contain caste/influencer/beneficiary data — same
sensitivity as the CSV export: generated on demand, downloaded locally,
never stored or uploaded. `*.docx` is not gitignored, but generated files
land in the user's Downloads folder, not the repo.

## Verification

Demo mode: select subset of booths, generate both teams pre-filled and
blank; inspect the downloaded .docx (python-docx) for page-per-booth,
correct field sets per team, and pre-filled values; build + lint clean.
