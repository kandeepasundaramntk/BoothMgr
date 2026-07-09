import { TEAM_LABEL, type Team, type TeamFilter } from '../data/teams'

export function TeamBadge({ team }: { team: Team }) {
  const label = TEAM_LABEL[team]
  return (
    <span className={`team-badge team-${team}`}>
      {label.ta} ({label.en})
    </span>
  )
}

const FILTERS: { value: TeamFilter; label: string }[] = [
  { value: 'all', label: 'அனைத்தும் (All)' },
  { value: 'poc', label: `${TEAM_LABEL.poc.ta} (${TEAM_LABEL.poc.en})` },
  { value: 'itw', label: `${TEAM_LABEL.itw.ta} (${TEAM_LABEL.itw.en})` },
]

export function TeamChips({ value, onChange }: { value: TeamFilter; onChange: (f: TeamFilter) => void }) {
  return (
    <div className="team-chips no-print" role="group" aria-label="அணி வடிகட்டி (team filter)">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          className={value === f.value ? 'chip active' : 'chip'}
          aria-pressed={value === f.value}
          onClick={() => onChange(f.value)}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
