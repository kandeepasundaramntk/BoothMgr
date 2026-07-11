-- 0007: parliament constituency hierarchy. Introduces
-- parliament_constituencies (each groups several assemblies) and the
-- assembly-side columns needed to place every assembly within that
-- hierarchy plus other electoral-geography metadata (district, state,
-- constituency code). Non-sensitive electoral geography — same
-- data-sensitivity tier as the assemblies list and the actions catalog
-- (see CLAUDE.md's Data Sensitivity section) — so it gets the same
-- authenticated-read-all policy shape as `actions_authenticated_read`
-- (0001) and is exposed to signed-out users the same limited way
-- `signup_assemblies()` exposes assembly id + name (0004): read access
-- only, no anon policy anywhere.

create table parliament_constituencies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pc_code text not null default '',
  state_code text not null default 'TN',
  created_at timestamptz not null default now()
);

alter table assemblies add column parliament_constituency_id uuid references parliament_constituencies(id);
alter table assemblies add column constituency_code text not null default '';
alter table assemblies add column district text not null default '';
alter table assemblies add column state_code text not null default 'TN';

create index assemblies_pc_idx on assemblies(parliament_constituency_id);

-- ---- RLS ----
alter table parliament_constituencies enable row level security;

create policy pc_authenticated_read on parliament_constituencies
  for select to authenticated using (true);

create policy pc_superadmin_insert on parliament_constituencies
  for insert to authenticated with check (app_is_superadmin());
create policy pc_superadmin_update on parliament_constituencies
  for update to authenticated using (app_is_superadmin()) with check (app_is_superadmin());
create policy pc_superadmin_delete on parliament_constituencies
  for delete to authenticated using (app_is_superadmin());

-- ---- activity log ----
-- Extend log_activity() (defined in full in 0005_activity_log.sql) with a
-- branch for parliament_constituencies. create or replace function
-- replaces the entire function body, so every existing branch is
-- reproduced here unchanged, plus the one new `when 'parliament_constituencies'`
-- branch. The new assembly columns added above need no new branch: the
-- 'assemblies' branch already logs the full old/new row diff (assemblies
-- is not one of the three redacted tables), so the new columns are
-- automatically captured.
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

create trigger parliament_constituencies_activity_log after insert or update or delete on parliament_constituencies
  for each row execute function log_activity();
