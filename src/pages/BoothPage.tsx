import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TeamBadge, TeamChips } from '../components/TeamBadge'
import { ACTIONS } from '../data/actionsCatalog'
import { getApi } from '../data/api'
import { FIELD_TEAM, matchesTeam, type BoothFieldKey, type TeamFilter } from '../data/teams'
import { L, useT } from '../i18n'
import type { ActionStatus, BoothDetail } from '../types'

const STATUS_OPTIONS: { value: ActionStatus; ta: string; en: string }[] = [
  { value: 'not_started', ta: 'தொடங்கப்படவில்லை', en: 'Not started' },
  { value: 'in_progress', ta: 'நடைபெறுகிறது', en: 'In progress' },
  { value: 'done', ta: 'முடிந்தது', en: 'Done' },
]

function pctWarning(sum: number, label: string): string | null {
  if (sum === 0) return null
  if (Math.abs(sum - 100) <= 2) return null
  return `${label} கூட்டுத்தொகை ${sum}% — 100% ஆக இருக்க வேண்டும் (should total ~100%)`
}

export default function BoothPage() {
  const { boothId } = useParams<{ boothId: string }>()
  const queryClient = useQueryClient()
  const t = useT()
  const [form, setForm] = useState<BoothDetail | null>(null)
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const detail = useQuery({
    queryKey: ['booth', boothId],
    queryFn: async () => (await getApi()).getBoothDetail(boothId!),
    enabled: Boolean(boothId),
  })

  useEffect(() => {
    if (detail.data && !dirty) setForm(structuredClone(detail.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const save = useMutation({
    mutationFn: async (d: BoothDetail) => (await getApi()).saveBoothDetail(d),
    onSuccess: () => {
      setDirty(false)
      setError(null)
      setSavedAt(new Date())
      void queryClient.invalidateQueries({ queryKey: ['booth', boothId] })
      void queryClient.invalidateQueries({ queryKey: ['booths'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  const actionMutation = useMutation({
    mutationFn: async (args: { actionId: number; status: ActionStatus; notes: string }) =>
      (await getApi()).setActionStatus(boothId!, args.actionId, args.status, args.notes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booths'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  if (detail.isLoading || !form) return <div className="card">Loading…</div>
  if (detail.isError) return <div className="card error">{String(detail.error)}</div>

  const update = (fn: (d: BoothDetail) => void) => {
    setForm((prev) => {
      const next = structuredClone(prev!)
      fn(next)
      return next
    })
    setDirty(true)
  }

  const getAction = (actionId: number) =>
    form.actions.find((a) => a.action_id === actionId) ?? { action_id: actionId, status: 'not_started' as const, notes: '' }

  const setActionLocal = (actionId: number, status: ActionStatus, notes: string) => {
    // action status saves immediately (not part of the Save button flow)
    setForm((prev) => {
      const next = structuredClone(prev!)
      const existing = next.actions.find((a) => a.action_id === actionId)
      if (existing) {
        existing.status = status
        existing.notes = notes
      } else {
        next.actions.push({ action_id: actionId, status, notes })
      }
      return next
    })
  }

  const casteSum = form.castes.reduce((s, c) => s + (c.pct || 0), 0)
  const religionSum = form.religions.reduce((s, r) => s + (r.pct || 0), 0)
  const healthSum = (form.booth.committed_pct ?? 0) + (form.booth.swing_pct ?? 0) + (form.booth.opponent_pct ?? 0)

  const numOrNull = (v: string) => (v === '' ? null : Number(v))

  const showField = (key: BoothFieldKey) => matchesTeam(FIELD_TEAM[key], teamFilter)

  return (
    <div className="card">
      <div className="toolbar no-print">
        <Link to={`/assembly/${form.booth.assembly_id}`}>← {t('வாக்குச்சாவடிகள்', 'Booths')}</Link>
        <span className="grow" />
        <Link className="btn small secondary" to={`/booth/${boothId}/print`}>
          🖨️ {t('அச்சு', 'Print view')}
        </Link>
      </div>

      <h2 className="page-title">
        பூத் {form.booth.booth_number} — {form.booth.village_ward_area || '…'}
      </h2>
      {error && <div className="error">{error}</div>}

      <TeamChips value={teamFilter} onChange={setTeamFilter} />

      <h3 className="section">{t('பகுதி 1 — பூத் மட்ட விவரங்கள்', 'Section 1 — Booth Level Details', ' | ')}</h3>

      <div className="two-col">
        <div className="field">
          <label>
            <L ta="வாக்குச்சாவடி எண்" en="Booth Number" />
          </label>
          <input
            value={form.booth.booth_number}
            onChange={(e) => update((d) => (d.booth.booth_number = e.target.value))}
          />
        </div>
        <div className="field">
          <label>
            <L ta="கிராமம் / வார்டு / பகுதி" en="Village / Ward / Area" />
          </label>
          <input
            value={form.booth.village_ward_area}
            onChange={(e) => update((d) => (d.booth.village_ward_area = e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {showField('party_votes') && (
      <div className="field">
        <label>
          <L ta="கட்சி வாரியாக பதிவான வாக்குகள் — 2026" en="2026 — Polled votes, party wise" />
          <TeamBadge team={FIELD_TEAM.party_votes} />
        </label>
        {form.partyVotes.map((v, i) => (
          <div className="repeat-row" key={i}>
            <input
              placeholder={t('கட்சி', 'Party')}
              value={v.party_name}
              onChange={(e) => update((d) => (d.partyVotes[i].party_name = e.target.value))}
            />
            <input
              className="num"
              type="number"
              min={0}
              placeholder={t('வாக்குகள்', 'Votes')}
              value={v.votes || ''}
              onChange={(e) => update((d) => (d.partyVotes[i].votes = Number(e.target.value)))}
            />
            <button
              type="button"
              className="btn small secondary"
              onClick={() => update((d) => d.partyVotes.splice(i, 1))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn small secondary"
          onClick={() => update((d) => d.partyVotes.push({ party_name: '', votes: 0 }))}
        >
          + {t('கட்சி சேர்', 'Add party')}
        </button>
      </div>
      )}

      <div className="two-col">
        {showField('castes') && (
        <div className="field">
          <label>
            <L ta="சாதி விகிதம் (%)" en="% of Caste" />
            <TeamBadge team={FIELD_TEAM.castes} />
          </label>
          {form.castes.map((c, i) => (
            <div className="repeat-row" key={i}>
              <input
                placeholder={t('சாதி', 'Caste')}
                value={c.caste_name}
                onChange={(e) => update((d) => (d.castes[i].caste_name = e.target.value))}
              />
              <input
                className="num"
                type="number"
                min={0}
                max={100}
                placeholder="%"
                value={c.pct || ''}
                onChange={(e) => update((d) => (d.castes[i].pct = Number(e.target.value)))}
              />
              <button type="button" className="btn small secondary" onClick={() => update((d) => d.castes.splice(i, 1))}>
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn small secondary"
            onClick={() => update((d) => d.castes.push({ caste_name: '', pct: 0 }))}
          >
            + {t('சேர்', 'Add')}
          </button>
          {pctWarning(casteSum, 'சாதி விகிதம்') && <p className="warn-text">{pctWarning(casteSum, 'சாதி விகிதம்')}</p>}
        </div>
        )}

        {showField('religions') && (
        <div className="field">
          <label>
            <L ta="மத விகிதம் (%)" en="% of Religion" />
            <TeamBadge team={FIELD_TEAM.religions} />
          </label>
          {form.religions.map((r, i) => (
            <div className="repeat-row" key={i}>
              <input
                placeholder={t('மதம்', 'Religion')}
                value={r.religion_name}
                onChange={(e) => update((d) => (d.religions[i].religion_name = e.target.value))}
              />
              <input
                className="num"
                type="number"
                min={0}
                max={100}
                placeholder="%"
                value={r.pct || ''}
                onChange={(e) => update((d) => (d.religions[i].pct = Number(e.target.value)))}
              />
              <button
                type="button"
                className="btn small secondary"
                onClick={() => update((d) => d.religions.splice(i, 1))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn small secondary"
            onClick={() => update((d) => d.religions.push({ religion_name: '', pct: 0 }))}
          >
            + {t('சேர்', 'Add')}
          </button>
          {pctWarning(religionSum, 'மத விகிதம்') && (
            <p className="warn-text">{pctWarning(religionSum, 'மத விகிதம்')}</p>
          )}
        </div>
        )}
      </div>

      {showField('influencers') && (
      <div className="field">
        <label>
          <L ta="உள்ளூர் செல்வாக்குள்ளவர்கள் — பெயர் & தொடர்பு" en="Micro-Influencers, name & contact" />
          <TeamBadge team={FIELD_TEAM.influencers} />
        </label>
        {form.influencers.map((f, i) => (
          <div className="repeat-row" key={i}>
            <input
              placeholder={t('பெயர்', 'Name')}
              value={f.name}
              onChange={(e) => update((d) => (d.influencers[i].name = e.target.value))}
            />
            <input
              placeholder={t('தொடர்பு', 'Contact')}
              value={f.contact}
              onChange={(e) => update((d) => (d.influencers[i].contact = e.target.value))}
            />
            <input
              placeholder={t('பங்கு', 'Role')}
              value={f.role_note}
              onChange={(e) => update((d) => (d.influencers[i].role_note = e.target.value))}
            />
            <button
              type="button"
              className="btn small secondary"
              onClick={() => update((d) => d.influencers.splice(i, 1))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn small secondary"
          onClick={() => update((d) => d.influencers.push({ name: '', contact: '', role_note: '' }))}
        >
          + {t('சேர்', 'Add')}
        </button>
      </div>
      )}

      {(
        [
          ['macro_trends', 'முக்கியப் பிரச்சனைகள் / சமூகப் பொருளாதாரப் போக்குகள்', 'Macro Socioeconomic Trends'],
          ['long_pending_issues', 'நீண்டகாலமாகத் தீர்க்கப்படாத பிரச்சனைகள்', 'Long Pending Issues'],
          ['alliance_dynamics', 'கூட்டணி மற்றும் வாக்குப்பிரிப்பு', 'Alliance Dynamics & Vote Splitters'],
          ['candidate_selection', 'வேட்பாளர் தேர்வு', 'Candidate Selection'],
          ['media_narrative', 'ஊடக மேலாண்மை', 'Media Narrative'],
          ['anti_incumbency', 'அரசு எதிர்ப்பு அலை', 'Anti-Incumbency'],
          ['beneficiary_mapping', 'பயனாளிகள் கணக்கெடுப்பு', 'Beneficiary Mapping'],
        ] as const
      )
        .filter(([key]) => showField(key))
        .map(([key, ta, en]) => (
          <div className="field" key={key}>
            <label>
              <L ta={ta} en={en} />
              <TeamBadge team={FIELD_TEAM[key]} />
            </label>
            <textarea value={form.booth[key]} onChange={(e) => update((d) => (d.booth[key] = e.target.value))} />
          </div>
        ))}

      <h3 className="section">{t('பகுதி 2 — பூத் மட்டச் செயல்பாடுகள்', 'Section 2 — Booth Level Actions', ' | ')}</h3>
      <p className="hint" style={{ marginBottom: 10 }}>
        <L
          ta="நிலை மாற்றங்கள் உடனே சேமிக்கப்படும்; குறிப்புகள் வெளியேறும்போது சேமிக்கப்படும்."
          en="Status changes save instantly; notes save when you leave the field."
        />
      </p>

      {ACTIONS.filter((action) => matchesTeam(action.team, teamFilter)).map((action) => {
        const st = getAction(action.id)
        return (
          <div className="action-item" key={action.id}>
            <div className="title-row">
              <span className="num">{action.id}.</span>
              <span className="title">
                <L ta={action.title_ta} en={action.title_en} />
              </span>
              <TeamBadge team={action.team} />
            </div>
            <div className="desc">{action.description_ta}</div>
            <div className="status-row">
              {STATUS_OPTIONS.map((opt) => (
                <label key={opt.value}>
                  <input
                    type="radio"
                    name={`action-${action.id}`}
                    checked={st.status === opt.value}
                    onChange={() => {
                      setActionLocal(action.id, opt.value, st.notes)
                      actionMutation.mutate({ actionId: action.id, status: opt.value, notes: st.notes })
                    }}
                  />
                  <L ta={opt.ta} en={opt.en} />
                </label>
              ))}
            </div>
            {action.id === 10 && (
              <div className="repeat-row" style={{ marginBottom: 8 }}>
                {(
                  [
                    ['committed_pct', 'Committed %'],
                    ['swing_pct', 'Swing %'],
                    ['opponent_pct', 'Opponent %'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    {label}
                    <input
                      className="num"
                      type="number"
                      min={0}
                      max={100}
                      value={form.booth[key] ?? ''}
                      onChange={(e) => update((d) => (d.booth[key] = numOrNull(e.target.value)))}
                    />
                  </label>
                ))}
                {pctWarning(healthSum, 'ஆரோக்கிய மதிப்பெண்') && (
                  <span className="warn-text">{pctWarning(healthSum, 'ஆரோக்கிய மதிப்பெண்')}</span>
                )}
              </div>
            )}
            <input
              style={{ width: '100%' }}
              placeholder={t('குறிப்புகள்', 'Notes')}
              defaultValue={st.notes}
              key={`notes-${action.id}-${st.notes}`}
              onBlur={(e) => {
                if (e.target.value !== st.notes) {
                  setActionLocal(action.id, st.status, e.target.value)
                  actionMutation.mutate({ actionId: action.id, status: st.status, notes: e.target.value })
                }
              }}
            />
          </div>
        )
      })}

      <div className="save-bar no-print">
        <button className="btn" onClick={() => save.mutate(form)} disabled={save.isPending || !dirty}>
          {save.isPending ? '…' : t('சேமி', 'Save')}
        </button>
        {dirty && (
          <span className="warn-text">
            <L ta="சேமிக்கப்படாத மாற்றங்கள் உள்ளன" en="unsaved changes" />
          </span>
        )}
        {!dirty && savedAt && (
          <span className="hint" style={{ color: 'var(--ok)' }}>
            <L ta="சேமிக்கப்பட்டது" en="saved" /> {savedAt.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  )
}
