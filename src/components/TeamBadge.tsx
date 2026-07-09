import { TEAM_LABEL, type Team, type TeamFilter } from '../data/teams'
import { useLang, useT } from '../i18n'

export function TeamBadge({ team }: { team: Team }) {
  const { lang } = useLang()
  const label = TEAM_LABEL[team]
  const [primary, secondary] = lang === 'ta' ? [label.ta, label.en] : [label.en, label.ta]
  return (
    <span className={`team-badge team-${team}`}>
      {primary} ({secondary})
    </span>
  )
}

export function TeamChips({ value, onChange }: { value: TeamFilter; onChange: (f: TeamFilter) => void }) {
  const t = useT()
  const filters: { value: TeamFilter; label: string }[] = [
    { value: 'all', label: t('அனைத்தும்', 'All') },
    { value: 'poc', label: t(TEAM_LABEL.poc.ta, TEAM_LABEL.poc.en) },
    { value: 'itw', label: t(TEAM_LABEL.itw.ta, TEAM_LABEL.itw.en) },
  ]
  return (
    <div className="team-chips no-print" role="group" aria-label={t('அணி வடிகட்டி', 'team filter')}>
      {filters.map((f) => (
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
