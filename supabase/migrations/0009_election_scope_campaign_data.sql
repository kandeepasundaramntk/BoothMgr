-- 0009: split cycle-specific campaign data out of the reusable geography.
--
-- Before this migration `booths` mixed two concerns: durable electoral
-- geography (assembly, booth number, village/ward) and per-cycle campaign
-- data (Booth Health Score percentages, the six narrative sections,
-- long-pending issues). The five booth-child tables (party votes, caste %,
-- religion %, influencers, actions) were likewise implicitly single-cycle.
--
-- This migration makes campaign data election-scoped:
--   * `booths` keeps ONLY geography.
--   * new `election_booths` holds the per-(election, booth) campaign data
--     that used to live on `booths`.
--   * the five child tables gain an `election_id` so the same booth can
--     carry independent child rows per election cycle.
--
-- A bootstrap election ("Tamil Nadu 2026 By-Election") is created and every
-- existing row is migrated under it, so no data is lost — see the ordering
-- guarantees called out at each step below.
--
-- ORDERING NOTE: the three dashboard views are DROPPED early (step C) —
-- before `booths`' campaign columns are dropped (step F) — because
-- `assembly_health_summary` reads booths.committed_pct/swing_pct/opponent_pct
-- and Postgres refuses to drop a column an existing view depends on. They are
-- recreated at the very end (step J), pointing at `election_booths`.

-- ============================================================
-- A. New table: election_booths (per-(election, booth) campaign data)
-- ============================================================
-- Column list / defaults / check-constraint shapes copied verbatim from
-- `booths` (0001_schema.sql) and `long_pending_issues` (0003).
create table election_booths (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references elections(id) on delete cascade,
  booth_id uuid not null references booths(id) on delete cascade,
  -- Booth Health Score inputs (action 10); percentages 0–100
  committed_pct numeric check (committed_pct between 0 and 100),
  swing_pct numeric check (swing_pct between 0 and 100),
  opponent_pct numeric check (opponent_pct between 0 and 100),
  -- free-text sections from the booth detail form
  macro_trends text not null default '',
  alliance_dynamics text not null default '',
  candidate_selection text not null default '',
  media_narrative text not null default '',
  anti_incumbency text not null default '',
  beneficiary_mapping text not null default '',
  long_pending_issues text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (election_id, booth_id)
);

create index election_booths_booth_idx on election_booths(booth_id);
create index election_booths_election_idx on election_booths(election_id);

-- Reuse the existing set_updated_at() trigger function (0001_schema.sql).
create trigger election_booths_updated_at before update on election_booths
  for each row execute function set_updated_at();

-- ============================================================
-- B. Add nullable election_id to the five booth-child tables
-- ============================================================
-- Nullable for now; backfilled in the do-block (step D) then set NOT NULL
-- (step E). on delete cascade mirrors each table's booth_id fk.
alter table booth_party_votes add column election_id uuid references elections(id) on delete cascade;
alter table booth_caste_pct add column election_id uuid references elections(id) on delete cascade;
alter table booth_religion_pct add column election_id uuid references elections(id) on delete cascade;
alter table booth_influencers add column election_id uuid references elections(id) on delete cascade;
alter table booth_actions add column election_id uuid references elections(id) on delete cascade;

-- ============================================================
-- C. Drop the three dashboard views (recreated in step J)
-- ============================================================
-- Must happen before step F drops booths' campaign columns:
-- assembly_health_summary depends on booths.committed_pct/swing_pct/opponent_pct.
drop view booth_completion;
drop view assembly_health_summary;
drop view action_progress;

-- ============================================================
-- D. Bootstrap election + data migration (single do-block so the freshly
--    minted election id is reachable by every data statement)
-- ============================================================
-- Runs BEFORE any destructive step: the election_booths copy (step 3 of the
-- brief) and the child-table backfills all read still-intact source data.
-- On a fresh (empty) database every select/update simply affects zero rows.
do $$
declare
  v_bootstrap_id uuid;
begin
  -- Step 1: bootstrap election, capture its id.
  insert into elections (name, year, status)
  values ('Tamil Nadu 2026 By-Election', 2026, 'active')
  returning id into v_bootstrap_id;

  -- Step 3: copy every booth's campaign columns into election_booths under
  -- the bootstrap election. Preserves the original created_at/updated_at.
  insert into election_booths (
    election_id, booth_id,
    committed_pct, swing_pct, opponent_pct,
    macro_trends, alliance_dynamics, candidate_selection,
    media_narrative, anti_incumbency, beneficiary_mapping,
    long_pending_issues, created_at, updated_at
  )
  select
    v_bootstrap_id, id,
    committed_pct, swing_pct, opponent_pct,
    macro_trends, alliance_dynamics, candidate_selection,
    media_narrative, anti_incumbency, beneficiary_mapping,
    long_pending_issues, created_at, updated_at
  from booths;

  -- Step 4 (backfill): every existing child row belongs to the bootstrap election.
  update booth_party_votes set election_id = v_bootstrap_id where election_id is null;
  update booth_caste_pct set election_id = v_bootstrap_id where election_id is null;
  update booth_religion_pct set election_id = v_bootstrap_id where election_id is null;
  update booth_influencers set election_id = v_bootstrap_id where election_id is null;
  update booth_actions set election_id = v_bootstrap_id where election_id is null;
end $$;

-- ============================================================
-- E. Now that every child row has an election_id, enforce NOT NULL
-- ============================================================
alter table booth_party_votes alter column election_id set not null;
alter table booth_caste_pct alter column election_id set not null;
alter table booth_religion_pct alter column election_id set not null;
alter table booth_influencers alter column election_id set not null;
alter table booth_actions alter column election_id set not null;

-- ============================================================
-- F. Drop the old campaign columns from booths
-- ============================================================
-- ****************************************************************
-- WARNING — DATA-LOSSY STEP BELOW. Read before applying to a real DB.
-- ****************************************************************
-- The statement below permanently removes the campaign columns from
-- `booths`. This is SAFE ONLY IF step D above completed successfully — that
-- do-block copied every one of these columns into `election_booths` under
-- the bootstrap election first. On any database that might already hold real
-- rows, confirm the copy landed before this runs, e.g. as a dry run:
--
--   select count(*) from booths;          -- rows that must be copied
--   select count(*) from election_booths; -- must equal the above
--
-- Do not apply this migration to a database with real data without doing
-- that check first. There is no recovery once the columns are gone.
alter table booths
  drop column committed_pct,
  drop column swing_pct,
  drop column opponent_pct,
  drop column macro_trends,
  drop column alliance_dynamics,
  drop column candidate_selection,
  drop column media_narrative,
  drop column anti_incumbency,
  drop column beneficiary_mapping,
  drop column long_pending_issues;

-- ============================================================
-- G. Re-scope the child-table uniqueness constraints by election
-- ============================================================
-- Old natural-key uniqueness was (booth_id, key) — added in 0006. It becomes
-- (election_id, booth_id, key) so the same booth can carry independent child
-- rows per election cycle. booth_actions' composite pk gains election_id too.
alter table booth_party_votes
  drop constraint booth_party_votes_booth_party_uk,
  add constraint booth_party_votes_election_booth_party_uk unique (election_id, booth_id, party_name);
alter table booth_caste_pct
  drop constraint booth_caste_pct_booth_caste_uk,
  add constraint booth_caste_pct_election_booth_caste_uk unique (election_id, booth_id, caste_name);
alter table booth_religion_pct
  drop constraint booth_religion_pct_booth_religion_uk,
  add constraint booth_religion_pct_election_booth_religion_uk unique (election_id, booth_id, religion_name);
alter table booth_influencers
  drop constraint booth_influencers_booth_name_uk,
  add constraint booth_influencers_election_booth_name_uk unique (election_id, booth_id, name);
-- booth_actions' primary key is the unnamed table-level pk from 0001 —
-- Postgres named it booth_actions_pkey by default.
alter table booth_actions
  drop constraint booth_actions_pkey,
  add primary key (election_id, booth_id, action_id);

-- ============================================================
-- H. RLS for election_booths
-- ============================================================
-- can_access_booth(bid) (0004) is unaffected — it keys off booths.assembly_id,
-- which did not move. The five child-table *_scoped_all policies (0004) still
-- key off booth_id and are intentionally left untouched. election_booths gets
-- one new policy mirroring booths_scoped_all's shape, keyed via booth_id.
alter table election_booths enable row level security;
create policy election_booths_scoped_all on election_booths
  for all to authenticated
  using (can_access_booth(booth_id))
  with check (can_access_booth(booth_id));

-- ============================================================
-- I. Activity log: move beneficiary_mapping redaction to election_booths
-- ============================================================
-- Full body reproduced from 0008_elections.sql (which was 0005's original
-- plus 0007's parliament_constituencies branch plus 0008's elections branch),
-- with two changes for this migration:
--   1. A new `when 'election_booths'` case branch resolves v_assembly_id via
--      booths (the same way the other booth-child tables do) and targets the
--      election_booths row id.
--   2. The beneficiary_mapping value-redaction special-case moves from the
--      `elsif TG_TABLE_NAME = 'booths'` branch to a new
--      `elsif TG_TABLE_NAME = 'election_booths'` branch. beneficiary_mapping
--      now lives on election_booths, not booths, so `booths` rows correctly
--      fall through to the generic full old/new diff `else` branch — the old
--      booths redaction branch is removed entirely.
create or replace function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor_email text;
  v_actor_full_name text;
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
  v_row jsonb := coalesce(v_new, v_old);
  v_assembly_id uuid;
  v_target_id uuid;
  v_booth_id uuid;
  v_details jsonb;
  v_changed_cols text[];
begin
  select email, full_name into v_actor_email, v_actor_full_name
  from profiles where id = auth.uid();

  case TG_TABLE_NAME
    when 'assemblies' then
      v_assembly_id := (v_row->>'id')::uuid;
      v_target_id := v_assembly_id;
    when 'booths' then
      v_assembly_id := (v_row->>'assembly_id')::uuid;
      v_target_id := (v_row->>'id')::uuid;
    when 'profiles' then
      v_assembly_id := (v_row->>'assembly_id')::uuid;
      v_target_id := (v_row->>'id')::uuid;
    when 'booth_actions' then
      v_booth_id := (v_row->>'booth_id')::uuid;
      v_target_id := v_booth_id;
      select b.assembly_id into v_assembly_id from booths b where b.id = v_booth_id;
    when 'election_booths' then
      v_booth_id := (v_row->>'booth_id')::uuid;
      v_target_id := (v_row->>'id')::uuid;
      select b.assembly_id into v_assembly_id from booths b where b.id = v_booth_id;
    when 'parliament_constituencies' then
      v_assembly_id := null;
      v_target_id := (v_row->>'id')::uuid;
    when 'elections' then
      v_assembly_id := null;
      v_target_id := (v_row->>'id')::uuid;
    else
      -- booth_party_votes, booth_caste_pct, booth_religion_pct, booth_influencers
      v_booth_id := (v_row->>'booth_id')::uuid;
      v_target_id := (v_row->>'id')::uuid;
      select b.assembly_id into v_assembly_id from booths b where b.id = v_booth_id;
  end case;

  if TG_TABLE_NAME in ('booth_caste_pct', 'booth_religion_pct', 'booth_influencers') then
    if TG_OP = 'UPDATE' then
      select array_agg(coalesce(n.key, o.key)) into v_changed_cols
      from jsonb_each(v_new) n
      full outer join jsonb_each(v_old) o on o.key = n.key
      where n.value is distinct from o.value;
      v_details := jsonb_build_object('op', TG_OP, 'changed_columns', to_jsonb(coalesce(v_changed_cols, array[]::text[])));
    else
      select array_agg(key) into v_changed_cols from jsonb_object_keys(v_row) as key;
      v_details := jsonb_build_object('op', TG_OP, 'columns', to_jsonb(coalesce(v_changed_cols, array[]::text[])));
    end if;
  elsif TG_TABLE_NAME = 'election_booths' then
    -- beneficiary_mapping is free-text "beneficiary information" — the
    -- other category CLAUDE.md's Data Sensitivity section calls out
    -- alongside caste/religion/influencer-contact data. Strip its value
    -- from both sides (like the three tables above) but keep the rest of
    -- the election_booths row fully diffable, and still record whether it
    -- changed. (Moved here from the old `booths` branch — beneficiary_mapping
    -- now lives on election_booths.)
    v_details := jsonb_build_object(
      'op', TG_OP,
      'old', v_old - 'beneficiary_mapping',
      'new', v_new - 'beneficiary_mapping',
      'beneficiary_mapping_changed', (v_old->>'beneficiary_mapping') is distinct from (v_new->>'beneficiary_mapping')
    );
  else
    v_details := jsonb_build_object('op', TG_OP, 'old', v_old, 'new', v_new);
  end if;

  insert into activity_log (actor_id, actor_email, actor_full_name, action_type, target_type, target_id, assembly_id, details)
  values (auth.uid(), coalesce(v_actor_email, ''), coalesce(v_actor_full_name, ''),
    TG_TABLE_NAME || '.' || lower(TG_OP), TG_TABLE_NAME, v_target_id, v_assembly_id, v_details);

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end $$;

create trigger election_booths_activity_log after insert or update or delete on election_booths
  for each row execute function log_activity();

-- ============================================================
-- J. Recreate the three dashboard views (now election-scoped) + pc_health_summary
-- ============================================================
-- Each view cross-joins `elections` (unfiltered) so a client filtering by
-- election_id sees natural zero-rows for a cycle with no data yet, exactly as
-- action_progress already cross-joins booths in 0001.

-- booth_completion: per (booth, election) action-completion counts.
create view booth_completion with (security_invoker = true) as
select
  b.id as booth_id,
  b.assembly_id,
  e.id as election_id,
  count(*) filter (where ba.status = 'done') as done_count,
  count(*) filter (where ba.status = 'in_progress') as in_progress_count,
  (select count(*) from actions) as total_actions
from booths b
cross join elections e
left join booth_actions ba on ba.booth_id = b.id and ba.election_id = e.id
group by b.id, b.assembly_id, e.id;

-- assembly_health_summary: per (assembly, election) Booth Health Score averages.
create view assembly_health_summary with (security_invoker = true) as
select
  a.id as assembly_id,
  a.name,
  e.id as election_id,
  count(b.id) as booth_count,
  avg(eb.committed_pct) as avg_committed_pct,
  avg(eb.swing_pct) as avg_swing_pct,
  avg(eb.opponent_pct) as avg_opponent_pct
from assemblies a
cross join elections e
left join booths b on b.assembly_id = a.id
left join election_booths eb on eb.booth_id = b.id and eb.election_id = e.id
group by a.id, a.name, e.id;

-- action_progress: per (action, assembly, election) status rollup.
create view action_progress with (security_invoker = true) as
select
  act.id as action_id,
  b.assembly_id,
  e.id as election_id,
  count(*) filter (where ba.status = 'done') as done_count,
  count(*) filter (where ba.status = 'in_progress') as in_progress_count,
  count(b.id) - count(ba.booth_id)
    + count(*) filter (where ba.status = 'not_started') as not_started_count
from actions act
cross join booths b
cross join elections e
left join booth_actions ba on ba.booth_id = b.id and ba.action_id = act.id and ba.election_id = e.id
group by act.id, b.assembly_id, e.id;

-- pc_health_summary: per (election, parliament_constituency) rollup across its
-- assemblies' booths. Joins elections × parliament_constituencies, then down
-- through assemblies → booths → election_booths.
create view pc_health_summary with (security_invoker = true) as
select
  e.id as election_id,
  pc.id as parliament_constituency_id,
  count(distinct a.id) as assembly_count,
  count(distinct b.id) as booth_count,
  avg(eb.committed_pct) as avg_committed_pct,
  avg(eb.swing_pct) as avg_swing_pct,
  avg(eb.opponent_pct) as avg_opponent_pct
from elections e
cross join parliament_constituencies pc
left join assemblies a on a.parliament_constituency_id = pc.id
left join booths b on b.assembly_id = a.id
left join election_booths eb on eb.booth_id = b.id and eb.election_id = e.id
group by e.id, pc.id;
