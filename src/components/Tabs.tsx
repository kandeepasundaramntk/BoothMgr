import { useLang } from '../i18n'

export interface TabDef<K extends string> {
  key: K
  ta: string
  en: string
}

/** Simple controlled tab bar — big touch targets, primary language on top. */
export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef<K>[]
  active: K
  onChange: (key: K) => void
}) {
  const { lang } = useLang()
  return (
    <div role="tablist" className="tabs no-print">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === active}
          className={`tab-btn${tab.key === active ? ' active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {lang === 'ta' ? tab.ta : tab.en}
          <span className="sub">{lang === 'ta' ? tab.en : tab.ta}</span>
        </button>
      ))}
    </div>
  )
}
