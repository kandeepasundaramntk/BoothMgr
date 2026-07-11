import type { TabDef } from '../components/Tabs'

/** The 4 topic sections of the booth form — shared by the editor's tabs and the print customization panel. */
export type BoothSection = 'basic' | 'votes' | 'issues' | 'actions'

export const BOOTH_SECTIONS: TabDef<BoothSection>[] = [
  { key: 'basic', ta: 'அடிப்படை விவரங்கள்', en: 'Basic details' },
  { key: 'votes', ta: 'வாக்குகள் & சமூகம்', en: 'Votes & social' },
  { key: 'issues', ta: 'பிரச்சனைகள் & குறிப்புகள்', en: 'Issues & notes' },
  { key: 'actions', ta: 'செயல்பாடுகள் (21)', en: 'Actions (21)' },
]
