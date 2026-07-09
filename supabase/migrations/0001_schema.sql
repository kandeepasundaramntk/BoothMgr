-- BoothMgr v1 schema
-- All tables carry deny-by-default RLS with authenticated-only policies:
-- this database holds sensitive political data (caste/religion breakdowns,
-- influencer contacts). Anonymous access must never be enabled.

create table assemblies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table booths (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies(id) on delete cascade,
  booth_number text not null,
  village_ward_area text not null default '',
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assembly_id, booth_number)
);

create table booth_party_votes (
  id uuid primary key default gen_random_uuid(),
  booth_id uuid not null references booths(id) on delete cascade,
  party_name text not null,
  votes integer not null check (votes >= 0)
);

create table booth_caste_pct (
  id uuid primary key default gen_random_uuid(),
  booth_id uuid not null references booths(id) on delete cascade,
  caste_name text not null,
  pct numeric not null check (pct between 0 and 100)
);

create table booth_religion_pct (
  id uuid primary key default gen_random_uuid(),
  booth_id uuid not null references booths(id) on delete cascade,
  religion_name text not null,
  pct numeric not null check (pct between 0 and 100)
);

create table booth_influencers (
  id uuid primary key default gen_random_uuid(),
  booth_id uuid not null references booths(id) on delete cascade,
  name text not null,
  contact text not null default '',
  role_note text not null default ''
);

-- catalog of the 21 booth-level actions (seeded in 0002)
create table actions (
  id integer primary key,
  sort_order integer not null,
  title_ta text not null,
  title_en text not null,
  description_ta text not null
);

create type action_status as enum ('not_started', 'in_progress', 'done');

-- rows are created lazily; a missing row means 'not_started'
create table booth_actions (
  booth_id uuid not null references booths(id) on delete cascade,
  action_id integer not null references actions(id),
  status action_status not null default 'not_started',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (booth_id, action_id)
);

create index booths_assembly_idx on booths(assembly_id);
create index booth_party_votes_booth_idx on booth_party_votes(booth_id);
create index booth_caste_pct_booth_idx on booth_caste_pct(booth_id);
create index booth_religion_pct_booth_idx on booth_religion_pct(booth_id);
create index booth_influencers_booth_idx on booth_influencers(booth_id);
create index booth_actions_action_idx on booth_actions(action_id);

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger booths_updated_at before update on booths
  for each row execute function set_updated_at();
create trigger booth_actions_updated_at before update on booth_actions
  for each row execute function set_updated_at();

-- ---- Row Level Security: authenticated users only, on every table ----
do $$
declare t text;
begin
  foreach t in array array[
    'assemblies','booths','booth_party_votes','booth_caste_pct',
    'booth_religion_pct','booth_influencers','actions','booth_actions'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

-- actions catalog is read-only for the app; only migrations write it
drop policy actions_authenticated_all on actions;
create policy actions_authenticated_read on actions
  for select to authenticated using (true);

-- ---- Dashboard views ----
create view booth_completion with (security_invoker = true) as
select
  b.id as booth_id,
  b.assembly_id,
  count(*) filter (where ba.status = 'done') as done_count,
  count(*) filter (where ba.status = 'in_progress') as in_progress_count,
  (select count(*) from actions) as total_actions
from booths b
left join booth_actions ba on ba.booth_id = b.id
group by b.id, b.assembly_id;

create view assembly_health_summary with (security_invoker = true) as
select
  a.id as assembly_id,
  a.name,
  count(b.id) as booth_count,
  avg(b.committed_pct) as avg_committed_pct,
  avg(b.swing_pct) as avg_swing_pct,
  avg(b.opponent_pct) as avg_opponent_pct
from assemblies a
left join booths b on b.assembly_id = a.id
group by a.id, a.name;

create view action_progress with (security_invoker = true) as
select
  act.id as action_id,
  b.assembly_id,
  count(*) filter (where ba.status = 'done') as done_count,
  count(*) filter (where ba.status = 'in_progress') as in_progress_count,
  count(b.id) - count(ba.booth_id)
    + count(*) filter (where ba.status = 'not_started') as not_started_count
from actions act
cross join booths b
left join booth_actions ba on ba.booth_id = b.id and ba.action_id = act.id
group by act.id, b.assembly_id;
