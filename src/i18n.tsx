/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * Tamil-primary ⇄ English-primary display toggle. Both languages are always
 * visible — the toggle only swaps which one is prominent. No i18n framework
 * (see CLAUDE.md); labels are written as ta/en pairs at the call site.
 * Print view and generated .docx forms stay Tamil-primary regardless.
 */
export type Lang = 'ta' | 'en'

const STORAGE_KEY = 'boothmgr-lang'

const LangContext = createContext<{ lang: Lang; setLang(lang: Lang): void } | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ta'))
  const setLang = (next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next)
    setLangState(next)
  }
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useLang(): { lang: Lang; setLang(lang: Lang): void } {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside LangProvider')
  return ctx
}

/** Bilingual label: primary language plain, the other in the small .en style. */
export function L({ ta, en }: { ta: string; en: string }) {
  const { lang } = useLang()
  const [primary, secondary] = lang === 'ta' ? [ta, en] : [en, ta]
  return (
    <>
      {primary} <span className="en">({secondary})</span>
    </>
  )
}

/** Plain-string version for placeholders, button captions, messages. */
export function useT(): (ta: string, en: string, sep?: string) => string {
  const { lang } = useLang()
  return (ta, en, sep = ' / ') => (lang === 'ta' ? `${ta}${sep}${en}` : `${en}${sep}${ta}`)
}
