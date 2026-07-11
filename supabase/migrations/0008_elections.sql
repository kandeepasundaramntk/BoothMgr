-- 0008: election cycles. Introduces `elections`, the top-level campaign
-- cycle a run of assemblies/booths/actions belongs to (e.g. "2026 Tamil
-- Nadu Assembly Election"). Non-sensitive campaign-cycle metadata — same
-- data-sensitivity tier as the assemblies list, the actions catalog, and
-- parliament_constituencies (0007) — so it gets the same
-- authenticated-read-all policy shape as `actions_authenticated_read`
-- (0001) and `pc_authenticated_read` (0007): every role needs the list for
-- the header picker. Writes are superadmin-only.

create type election_status as enum ('upcoming', 'active', 'archived');

create table elections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year integer not null,
  status election_status not null default 'upcoming',
  created_at timestamptz not null default now()
);

-- ---- RLS ----
alter table elections enable row level security;

create policy elections_authenticated_read on elections
  for select to authenticated using (true);

create policy elections_superadmin_insert on elections
  for insert to authenticated with check (app_is_superadmin());
create policy elections_superadmin_update on elections
  for update to authenticated using (app_is_superadmin()) with check (app_is_superadmin());
create policy elections_superadmin_delete on elections
  for delete to authenticated using (app_is_superadmin());

-- ---- activity log ----
-- Extend log_activity() (defined in full in 0005_activity_log.sql, then
-- extended in 0007_parliament_constituencies.sql with a
-- parliament_constituencies branch) with a branch for elections.
-- create or replace function replaces the entire function body, so every
-- existing branch (0005's originals plus 0007's parliament_constituencies
-- branch) is reproduced here unchanged, plus the one new `when 'elections'`
-- branch.
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
  elsif TG_TABLE_NAME = 'booths' then
    -- beneficiary_mapping is free-text "beneficiary information" — the
    -- other category CLAUDE.md's Data Sensitivity section calls out
    -- alongside caste/religion/influencer-contact data. Strip its value
    -- from both sides (like the three tables above) but keep the rest of
    -- the booth row fully diffable, and still record whether it changed.
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

create trigger elections_activity_log after insert or update or delete on elections
  for each row execute function log_activity();
