import type { BoothDetail } from '../types'
import { downloadBlob, safeFilenamePart } from './download'

/**
 * Generates the per-team paper booth forms (same layout as the hand-made
 * Booth-Form-Assembly-POC.docx / Booth-Form-ITWing.docx) as Word files —
 * one combined document per team, one booth per page.
 *
 * The docx library is loaded on demand so it never weighs down the main
 * bundle; pre-filled output carries the same data sensitivity as the CSV
 * export (local download only).
 */

export type FormTeam = 'poc' | 'itw'

export interface GenerateFormsOptions {
  assemblyName: string
  /** Active election's name, shown in the doc title and party-votes field label. Optional — defaults to ''. */
  electionName?: string
  /** Booths to include, already filtered and ordered. */
  details: BoothDetail[]
  teams: FormTeam[]
  /** true: include data already entered in the app; false: blank forms. */
  prefilled: boolean
}

type Docx = typeof import('docx')

const ACCENT = 'B71C1C'
const FONT = 'Nirmala UI'
const LINE = '_'.repeat(100)

const TEAM_TITLE: Record<FormTeam, string> = {
  poc: 'தொகுதி பொறுப்பாளர் பணிகள் (Assembly POC Tasks)',
  itw: 'இணையக் குழு பணிகள் (IT Wing Tasks)',
}

interface TableFieldSpec {
  kind: 'table'
  label: string
  cols: string[]
  blankRows: number
  rows(d: BoothDetail): string[][]
  /** Free-text app field shown instead of the table in pre-filled mode. */
  prefillText?(d: BoothDetail): string
}

interface LinesFieldSpec {
  kind: 'lines'
  label: string
  lines: number
  text(d: BoothDetail): string
}

type FieldSpec = TableFieldSpec | LinesFieldSpec

const POC_FIELDS: FieldSpec[] = [
  {
    kind: 'table',
    label: 'சாதி விகிதம் (% of Caste)',
    cols: ['சாதி (Caste)', '% விகிதம் (%)'],
    blankRows: 6,
    rows: (d) => d.castes.map((c) => [c.caste_name, `${c.pct}%`]),
  },
  {
    kind: 'table',
    label: 'மத விகிதம் (% of Religion)',
    cols: ['மதம் (Religion)', '% விகிதம் (%)'],
    blankRows: 4,
    rows: (d) => d.religions.map((r) => [r.religion_name, `${r.pct}%`]),
  },
  {
    kind: 'table',
    label: 'உள்ளூர் செல்வாக்குள்ளவர்கள் – பெயர் & தொடர்பு விவரங்கள் (Micro-Influencer Name & Contact Details)',
    cols: ['பெயர் (Name)', 'பங்கு / செல்வாக்கு (Role)', 'தொடர்பு எண் (Contact)'],
    blankRows: 5,
    rows: (d) => d.influencers.map((f) => [f.name, f.role_note, f.contact]),
  },
  {
    kind: 'table',
    label: 'பயனாளிகள் கணக்கெடுப்பு (Beneficiary Mapping)',
    cols: ['நலத்திட்டம் (Scheme)', 'பயனாளிகள் எண்ணிக்கை (No. of Beneficiaries)', 'குறிப்பு (Notes)'],
    blankRows: 5,
    rows: () => [],
    // the app stores beneficiary mapping as free text, not scheme rows
    prefillText: (d) => d.booth.beneficiary_mapping,
  },
  {
    kind: 'lines',
    label: 'முக்கியப் பிரச்சனைகள் (Macro Socioeconomic Trends)',
    lines: 5,
    text: (d) => d.booth.macro_trends,
  },
  {
    kind: 'lines',
    label: 'நீண்டகாலமாகத் தீர்க்கப்படாத பிரச்சனைகள் (Long Pending Issues)',
    lines: 5,
    text: (d) => d.booth.long_pending_issues,
  },
  {
    kind: 'lines',
    label: 'வேட்பாளர் தேர்வு (Candidate Selection)',
    lines: 5,
    text: (d) => d.booth.candidate_selection,
  },
  {
    kind: 'lines',
    label: 'கூட்டணி மற்றும் வாக்குப்பிரிப்பு (Alliance Dynamics & Vote Splitters)',
    lines: 5,
    text: (d) => d.booth.alliance_dynamics,
  },
  {
    kind: 'lines',
    label: 'அரசு எதிர்ப்பு அலை (Anti-Incumbency)',
    lines: 5,
    text: (d) => d.booth.anti_incumbency,
  },
]

const itwFields = (electionName: string): FieldSpec[] => [
  {
    kind: 'table',
    label: electionName
      ? `${electionName} பதிவான வாக்குகள் – கட்சி வாரியாக (${electionName} Polled Votes / Party wise)`
      : 'பதிவான வாக்குகள் – கட்சி வாரியாக (Polled Votes / Party wise)',
    cols: ['கட்சி (Party)', 'வாக்குகள் (Votes)'],
    blankRows: 6,
    rows: (d) => d.partyVotes.map((v) => [v.party_name, String(v.votes)]),
  },
  {
    kind: 'lines',
    label: 'ஊடக மேலாண்மை (Media Narrative)',
    lines: 5,
    text: (d) => d.booth.media_narrative,
  },
  {
    kind: 'lines',
    label: 'கூட்டணி மற்றும் வாக்குப்பிரிப்பு (Alliance Dynamics & Vote Splitters)',
    lines: 5,
    text: (d) => d.booth.alliance_dynamics,
  },
  {
    kind: 'lines',
    label: 'அரசு எதிர்ப்பு அலை (Anti-Incumbency)',
    lines: 5,
    text: (d) => d.booth.anti_incumbency,
  },
]

const teamFields = (team: FormTeam, electionName: string): FieldSpec[] =>
  team === 'poc' ? POC_FIELDS : itwFields(electionName)

function buildBoothSection(
  dx: Docx,
  team: FormTeam,
  assemblyName: string,
  electionName: string,
  d: BoothDetail,
  slNo: number,
  prefilled: boolean,
) {
  const { AlignmentType, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = dx

  const title = (text: string, size: number, color?: string) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text, bold: true, size, color })],
    })

  const labelCell = (label: string, value: string) =>
    new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: `${label} :  `, bold: true, size: 20 }),
            new TextRun({ text: value || '_'.repeat(22), size: 20 }),
          ],
        }),
      ],
    })

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          labelCell('வரிசை எண் (Sl. No.)', String(slNo)),
          labelCell('சட்டமன்றத் தொகுதி (Assembly Name)', assemblyName),
        ],
      }),
      new TableRow({
        children: [
          labelCell('வாக்குச்சாவடி எண் (Booth Number)', d.booth.booth_number),
          labelCell('கிராமம் / வார்டு / பகுதி (Village / Ward / Area)', d.booth.village_ward_area),
        ],
      }),
      new TableRow({
        children: [labelCell('படிவம் நிரப்புபவர் (Filled by)', ''), labelCell('தேதி (Date)', '')],
      }),
    ],
  })

  const children: (InstanceType<Docx['Paragraph']> | InstanceType<Docx['Table']>)[] = [
    title('நாம் தமிழர் கட்சி — பூத் மட்ட விவரப் படிவம் (Booth Level Details Form)', 28, ACCENT),
    title(TEAM_TITLE[team], 24),
    ...(electionName ? [title(electionName, 20)] : []),
    headerTable,
  ]

  const fieldLabel = (num: number, label: string) =>
    new Paragraph({
      spacing: { before: 200, after: 80 },
      children: [new TextRun({ text: `${num}. ${label}`, bold: true, size: 21, color: ACCENT })],
    })

  const writingLine = () =>
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: LINE, size: 20 })] })

  const textParagraphs = (text: string) =>
    (text || '—').split('\n').map(
      (line) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: line, size: 20 })] }),
    )

  const dataTable = (cols: string[], rows: string[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: cols.map(
            (c) =>
              new TableCell({
                shading: { fill: 'F2F2F2' },
                children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, size: 18 })] })],
              }),
          ),
        }),
        ...rows.map(
          (r) =>
            new TableRow({
              children: cols.map(
                (_c, j) =>
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: r[j] ?? ' ', size: 20 })] })],
                  }),
              ),
            }),
        ),
      ],
    })

  teamFields(team, electionName).forEach((field, i) => {
    children.push(fieldLabel(i + 1, field.label))
    if (field.kind === 'lines') {
      if (prefilled) children.push(...textParagraphs(field.text(d)))
      const blanks = prefilled ? 2 : field.lines
      for (let n = 0; n < blanks; n++) children.push(writingLine())
    } else if (prefilled && field.prefillText) {
      children.push(...textParagraphs(field.prefillText(d)))
      children.push(writingLine(), writingLine())
    } else {
      const dataRows = prefilled ? field.rows(d) : []
      const emptyCount = prefilled ? 2 : field.blankRows
      const empty = Array.from({ length: emptyCount }, () => field.cols.map(() => ' '))
      children.push(dataTable(field.cols, [...dataRows, ...empty]))
    }
  })

  children.push(
    new Paragraph({
      spacing: { before: 320 },
      children: [
        new TextRun({
          text: 'கையொப்பம் (Signature): ____________________          சரிபார்த்தவர் (Verified by): ____________________',
          size: 20,
        }),
      ],
    }),
  )

  return {
    properties: {
      page: { margin: { top: 737, bottom: 737, left: 850, right: 850 } },
    },
    children,
  }
}

export async function generateTeamForms(opts: GenerateFormsOptions): Promise<void> {
  const dx = await import('docx')
  const safeName = safeFilenamePart(opts.assemblyName)
  const date = new Date().toISOString().slice(0, 10)
  const electionName = opts.electionName ?? ''

  const files: { name: string; blob: Blob }[] = []
  for (const team of opts.teams) {
    const doc = new dx.Document({
      styles: { default: { document: { run: { font: FONT } } } },
      sections: opts.details.map((d, idx) =>
        buildBoothSection(dx, team, opts.assemblyName, electionName, d, idx + 1, opts.prefilled),
      ),
    })
    const blob = await dx.Packer.toBlob(doc)
    const teamName = team === 'poc' ? 'Assembly-POC' : 'IT-Wing'
    files.push({ name: `boothmgr-${safeName}-${teamName}-forms-${date}.docx`, blob })
  }

  if (files.length === 1) {
    downloadBlob(files[0].blob, files[0].name)
    return
  }
  // browsers drop the second of two programmatic downloads (the user
  // gesture is spent on the first) — ship multiple files as one zip
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (const f of files) zip.file(f.name, f.blob)
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, `boothmgr-${safeName}-forms-${date}.zip`)
}
