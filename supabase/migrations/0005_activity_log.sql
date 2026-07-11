-- 0005: generic audit trail. Every insert/update/delete on the tables
-- listed below is captured automatically via AFTER triggers — nothing in
-- the client or in any RPC needs to remember to log anything, and nothing
-- can silently bypass it by writing to a table directly.
--
-- actor_id/target_id/assembly_id are plain uuid columns, deliberately NOT
-- foreign keys: an append-only audit log must still accept a row
-- describing an entity (e.g. an assembly) that is being deleted in the
-- very same statement that fires the trigger, and must keep old entries
-- readable after that entity is later deleted entirely. Do not "fix" this
-- by adding a constraint.
--
-- booth_caste_pct/booth_religion_pct/booth_influencers carry the most
-- sensitive data per CLAUDE.md's Data Sensitivity section (caste/religion
-- breakdowns, contact details) — for those three tables only, `details`
-- records which columns changed, never the actual values, so this log
-- never becomes a second, unredacted, ever-growing copy of that data.
-- booths.beneficiary_mapping (free-text "beneficiary information", the
-- other sensitive category CLAUDE.md names) gets the same value-redaction
-- treatment, while the rest of that table's columns are still fully
-- diffable — see the TG_TABLE_NAME = 'booths' branch below.

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text not null default '',
  actor_full_name text not null default '',
  action_type text not null,
  target_type text not null,
  target_id uuid,
  assembly_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_created_at_idx on activity_log(created_at desc);
create index activity_log_assembly_created_idx on activity_log(assembly_id, created_at desc);
create index activity_log_actor_idx on activity_log(actor_id);
create index activity_log_action_type_idx on activity_log(action_type);

alter table activity_log enable row level security;

-- No insert/update/delete policy for `authenticated` at all — every write
-- comes from the security-definer trigger function below (or the RPCs in
-- 0006), which run as the function owner and bypass RLS entirely, exactly
-- like `profiles` (0004) has zero write policies and is written only via
-- `set_user_role` etc. Do not add an insert policy "to fix" a permission
-- error here — regular authenticated writes to this table should fail.
create policy activity_log_select on activity_log
  for select to authenticated using (app_is_superadmin());

-- Generic trigger function. Field access on a possibly-unassigned NEW/OLD
-- record (e.g. `old.id` inside an INSERT trigger) raises "record 'old' is
-- not assigned yet" — so every field is read via the jsonb conversion of
-- the whole row instead (to_jsonb(NEW)/to_jsonb(OLD) safely evaluate to
-- SQL NULL when that side is inapplicable; only the ->> operator ever
-- touches a specific field, and ->> on NULL is itself just NULL).
create function log_activity() returns trigger
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

create trigger assemblies_activity_log after insert or update or delete on assemblies
  for each row execute function log_activity();
create trigger booths_activity_log after insert or update or delete on booths
  for each row execute function log_activity();
create trigger booth_party_votes_activity_log after insert or update or delete on booth_party_votes
  for each row execute function log_activity();
create trigger booth_caste_pct_activity_log after insert or update or delete on booth_caste_pct
  for each row execute function log_activity();
create trigger booth_religion_pct_activity_log after insert or update or delete on booth_religion_pct
  for each row execute function log_activity();
create trigger booth_influencers_activity_log after insert or update or delete on booth_influencers
  for each row execute function log_activity();
create trigger booth_actions_activity_log after insert or update or delete on booth_actions
  for each row execute function log_activity();
create trigger profiles_activity_log after insert or update or delete on profiles
  for each row execute function log_activity();
