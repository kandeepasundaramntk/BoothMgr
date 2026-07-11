-- 0006: superadmin bulk-operation RPCs — restore a per-assembly JSON
-- backup, bulk-create assemblies from a JSON upload, clear booth data
-- (per-assembly or system-wide), and log view-as start/end. Depends on
-- 0005 (all five RPCs below write a summary row to activity_log).
--
-- ****************************************************************
-- WARNING — DATA-LOSSY STEP BELOW. Read before applying to a real DB.
-- ****************************************************************
-- The dedup cleanup immediately below silently deletes duplicate rows in
-- four booth-child tables so the new unique constraints can be added. On
-- any database that might already hold real rows, run this manually first
-- as a dry-run SELECT/count (not the DELETE) to see how many rows would be
-- affected before applying this migration for real:
--
--   select count(*) from (
--     select booth_id, party_name from booth_party_votes
--     group by booth_id, party_name having count(*) > 1
--   ) x;
--   -- repeat for booth_caste_pct(caste_name), booth_religion_pct(religion_name),
--   -- booth_influencers(name)
--
-- Do not apply this migration to a database with real data without doing
-- that check first.

delete from booth_party_votes a using booth_party_votes b
  where a.booth_id = b.booth_id and a.party_name = b.party_name and a.id > b.id;
delete from booth_caste_pct a using booth_caste_pct b
  where a.booth_id = b.booth_id and a.caste_name = b.caste_name and a.id > b.id;
delete from booth_religion_pct a using booth_religion_pct b
  where a.booth_id = b.booth_id and a.religion_name = b.religion_name and a.id > b.id;
delete from booth_influencers a using booth_influencers b
  where a.booth_id = b.booth_id and a.name = b.name and a.id > b.id;

-- Enables upsert-by-natural-key in restore_assembly_backup below.
-- Side effect: the booth editor currently lets a user enter two rows with
-- the same natural key in one save (nothing prevents e.g. two "Party A"
-- vote rows) — that save will now fail with a unique-violation instead of
-- silently succeeding. Not fixed here; a fast-follow if it comes up.
alter table booth_party_votes add constraint booth_party_votes_booth_party_uk unique (booth_id, party_name);
alter table booth_caste_pct add constraint booth_caste_pct_booth_caste_uk unique (booth_id, caste_name);
alter table booth_religion_pct add constraint booth_religion_pct_booth_religion_uk unique (booth_id, religion_name);
alter table booth_influencers add constraint booth_influencers_booth_name_uk unique (booth_id, name);
-- booth_actions already has composite pk (booth_id, action_id); booths
-- already has unique (assembly_id, booth_number) — no new constraint
-- needed for either.

-- ---- restore_assembly_backup ----
-- Upserts every booth (and child row) in p_payload into p_assembly_id.
-- Merge/upsert, never destructive — matching booths/booth_number and each
-- child table's new natural-key constraint. One transaction: a mid-loop
-- failure rolls back the entire restore rather than leaving an assembly
-- half-restored. p_payload shape: {format_version:1, exported_at, assembly,
-- booths: [{booth:{...}, partyVotes:[...], castes:[...], religions:[...],
-- influencers:[...], actions:[...]}]} — matches AssemblyBackup client-side.
create function restore_assembly_backup(p_assembly_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_booth jsonb;
  v_child jsonb;
  v_booth_id uuid;
  v_booths_upserted integer := 0;
  v_party_votes_upserted integer := 0;
  v_castes_upserted integer := 0;
  v_religions_upserted integer := 0;
  v_influencers_upserted integer := 0;
  v_actions_upserted integer := 0;
  v_actor_email text;
  v_actor_full_name text;
begin
  if not app_is_superadmin() then
    raise exception 'not allowed';
  end if;

  if coalesce(p_payload->>'format_version', '') <> '1' then
    raise exception 'unsupported backup format version';
  end if;

  if not exists (select 1 from assemblies where id = p_assembly_id) then
    raise exception 'assembly not found';
  end if;

  for v_booth in select value from jsonb_array_elements(coalesce(p_payload->'booths', '[]'::jsonb)) as value
  loop
    insert into booths (
      assembly_id, booth_number, village_ward_area,
      committed_pct, swing_pct, opponent_pct,
      macro_trends, alliance_dynamics, candidate_selection,
      media_narrative, anti_incumbency, beneficiary_mapping, long_pending_issues
    ) values (
      p_assembly_id,
      v_booth->'booth'->>'booth_number',
      coalesce(v_booth->'booth'->>'village_ward_area', ''),
      nullif(v_booth->'booth'->>'committed_pct', '')::numeric,
      nullif(v_booth->'booth'->>'swing_pct', '')::numeric,
      nullif(v_booth->'booth'->>'opponent_pct', '')::numeric,
      coalesce(v_booth->'booth'->>'macro_trends', ''),
      coalesce(v_booth->'booth'->>'alliance_dynamics', ''),
      coalesce(v_booth->'booth'->>'candidate_selection', ''),
      coalesce(v_booth->'booth'->>'media_narrative', ''),
      coalesce(v_booth->'booth'->>'anti_incumbency', ''),
      coalesce(v_booth->'booth'->>'beneficiary_mapping', ''),
      coalesce(v_booth->'booth'->>'long_pending_issues', '')
    )
    on conflict (assembly_id, booth_number) do update set
      village_ward_area = excluded.village_ward_area,
      committed_pct = excluded.committed_pct,
      swing_pct = excluded.swing_pct,
      opponent_pct = excluded.opponent_pct,
      macro_trends = excluded.macro_trends,
      alliance_dynamics = excluded.alliance_dynamics,
      candidate_selection = excluded.candidate_selection,
      media_narrative = excluded.media_narrative,
      anti_incumbency = excluded.anti_incumbency,
      beneficiary_mapping = excluded.beneficiary_mapping,
      long_pending_issues = excluded.long_pending_issues
    returning id into v_booth_id;

    v_booths_upserted := v_booths_upserted + 1;

    for v_child in select value from jsonb_array_elements(coalesce(v_booth->'partyVotes', '[]'::jsonb)) as value
    loop
      insert into booth_party_votes (booth_id, party_name, votes)
      values (v_booth_id, v_child->>'party_name', (v_child->>'votes')::integer)
      on conflict (booth_id, party_name) do update set votes = excluded.votes;
      v_party_votes_upserted := v_party_votes_upserted + 1;
    end loop;

    for v_child in select value from jsonb_array_elements(coalesce(v_booth->'castes', '[]'::jsonb)) as value
    loop
      insert into booth_caste_pct (booth_id, caste_name, pct)
      values (v_booth_id, v_child->>'caste_name', (v_child->>'pct')::numeric)
      on conflict (booth_id, caste_name) do update set pct = excluded.pct;
      v_castes_upserted := v_castes_upserted + 1;
    end loop;

    for v_child in select value from jsonb_array_elements(coalesce(v_booth->'religions', '[]'::jsonb)) as value
    loop
      insert into booth_religion_pct (booth_id, religion_name, pct)
      values (v_booth_id, v_child->>'religion_name', (v_child->>'pct')::numeric)
      on conflict (booth_id, religion_name) do update set pct = excluded.pct;
      v_religions_upserted := v_religions_upserted + 1;
    end loop;

    for v_child in select value from jsonb_array_elements(coalesce(v_booth->'influencers', '[]'::jsonb)) as value
    loop
      insert into booth_influencers (booth_id, name, contact, role_note)
      values (v_booth_id, v_child->>'name', coalesce(v_child->>'contact', ''), coalesce(v_child->>'role_note', ''))
      on conflict (booth_id, name) do update set contact = excluded.contact, role_note = excluded.role_note;
      v_influencers_upserted := v_influencers_upserted + 1;
    end loop;

    for v_child in select value from jsonb_array_elements(coalesce(v_booth->'actions', '[]'::jsonb)) as value
    loop
      insert into booth_actions (booth_id, action_id, status, notes, updated_by)
      values (v_booth_id, (v_child->>'action_id')::integer, (v_child->>'status')::action_status, coalesce(v_child->>'notes', ''), auth.uid())
      on conflict (booth_id, action_id) do update set
        status = excluded.status, notes = excluded.notes, updated_by = excluded.updated_by;
      v_actions_upserted := v_actions_upserted + 1;
    end loop;
  end loop;

  select email, full_name into v_actor_email, v_actor_full_name from profiles where id = auth.uid();
  -- One summary row, not the whole payload again — the per-row triggers on
  -- booths/booth_party_votes/etc. already captured every individual change
  -- during the loop above; re-embedding it all here would just double the
  -- blast radius of a leaked log for zero informational benefit.
  insert into activity_log (actor_id, actor_email, actor_full_name, action_type, target_type, target_id, assembly_id, details)
  values (auth.uid(), coalesce(v_actor_email, ''), coalesce(v_actor_full_name, ''),
    'backup.restore', 'assembly', p_assembly_id, p_assembly_id,
    jsonb_build_object('booths_count', v_booths_upserted, 'source_exported_at', p_payload->>'exported_at'));

  return jsonb_build_object(
    'booths_upserted', v_booths_upserted,
    'party_votes_upserted', v_party_votes_upserted,
    'castes_upserted', v_castes_upserted,
    'religions_upserted', v_religions_upserted,
    'influencers_upserted', v_influencers_upserted,
    'actions_upserted', v_actions_upserted
  );
end $$;

grant execute on function restore_assembly_backup(uuid, jsonb) to authenticated;

-- ---- bulk_create_assemblies ----
-- p_payload: jsonb array of {name, booths?: [{booth_number, village_ward_area?}]}.
-- Skip-and-report on name collision, not atomic-all-or-fail — matches the
-- existing importBooths precedent (a duplicate doesn't abort the batch).
-- A colliding assembly's nested booths are still applied against the
-- existing assembly, so re-uploading the same file is idempotent.
create function bulk_create_assemblies(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_entry jsonb;
  v_booth jsonb;
  v_assembly_id uuid;
  v_name text;
  v_created integer := 0;
  v_skipped text[] := array[]::text[];
  v_booths_created integer := 0;
  v_actor_email text;
  v_actor_full_name text;
begin
  if not app_is_superadmin() then
    raise exception 'not allowed';
  end if;

  for v_entry in select value from jsonb_array_elements(p_payload) as value
  loop
    v_name := v_entry->>'name';
    v_assembly_id := null;

    insert into assemblies (name) values (v_name)
    on conflict (name) do nothing
    returning id into v_assembly_id;

    if v_assembly_id is null then
      select id into v_assembly_id from assemblies where name = v_name;
      v_skipped := v_skipped || v_name;
    else
      v_created := v_created + 1;
    end if;

    for v_booth in select value from jsonb_array_elements(coalesce(v_entry->'booths', '[]'::jsonb)) as value
    loop
      insert into booths (assembly_id, booth_number, village_ward_area)
      values (v_assembly_id, v_booth->>'booth_number', coalesce(v_booth->>'village_ward_area', ''))
      on conflict (assembly_id, booth_number) do nothing;
      if found then
        v_booths_created := v_booths_created + 1;
      end if;
    end loop;
  end loop;

  select email, full_name into v_actor_email, v_actor_full_name from profiles where id = auth.uid();
  insert into activity_log (actor_id, actor_email, actor_full_name, action_type, target_type, target_id, assembly_id, details)
  values (auth.uid(), coalesce(v_actor_email, ''), coalesce(v_actor_full_name, ''),
    'assemblies.bulk_create', 'assembly', null, null,
    jsonb_build_object('assemblies_created', v_created, 'assemblies_skipped', to_jsonb(v_skipped), 'booths_created', v_booths_created));

  return jsonb_build_object('assemblies_created', v_created, 'assemblies_skipped', to_jsonb(v_skipped), 'booths_created', v_booths_created);
end $$;

grant execute on function bulk_create_assemblies(jsonb) to authenticated;

-- ---- clear_assembly_data / clear_all_data ----
-- Deletes booths only (cascades handle all five child tables automatically
-- — confirmed every child table's booth_id fk is `on delete cascade`).
-- Never deletes assemblies or profiles. Superadmin-only via a dedicated RPC
-- rather than the existing booths_scoped_all RLS policy: that policy is
-- intentionally broad (any admin/superadmin/assigned POC/member can
-- delete/update booths they can access, needed for normal editing) and
-- RLS structurally cannot distinguish "this delete came from Clear Data"
-- from an ordinary edit — so the narrower app_is_superadmin()-only gate
-- lives inside this function body instead, called only from the Clear
-- Data UI, never as a raw .delete().
create function clear_assembly_data(p_assembly_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_actor_email text;
  v_actor_full_name text;
begin
  if not app_is_superadmin() then
    raise exception 'not allowed';
  end if;

  select count(*) into v_count from booths where assembly_id = p_assembly_id;
  delete from booths where assembly_id = p_assembly_id;

  select email, full_name into v_actor_email, v_actor_full_name from profiles where id = auth.uid();
  insert into activity_log (actor_id, actor_email, actor_full_name, action_type, target_type, target_id, assembly_id, details)
  values (auth.uid(), coalesce(v_actor_email, ''), coalesce(v_actor_full_name, ''),
    'data.clear_assembly', 'assembly', p_assembly_id, p_assembly_id, jsonb_build_object('booths_deleted', v_count));

  return v_count;
end $$;

create function clear_all_data() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_actor_email text;
  v_actor_full_name text;
begin
  if not app_is_superadmin() then
    raise exception 'not allowed';
  end if;

  select count(*) into v_count from booths;
  delete from booths;

  select email, full_name into v_actor_email, v_actor_full_name from profiles where id = auth.uid();
  insert into activity_log (actor_id, actor_email, actor_full_name, action_type, target_type, target_id, assembly_id, details)
  values (auth.uid(), coalesce(v_actor_email, ''), coalesce(v_actor_full_name, ''),
    'data.clear_all', 'system', null, null, jsonb_build_object('booths_deleted', v_count));

  return v_count;
end $$;

grant execute on function clear_assembly_data(uuid) to authenticated;
grant execute on function clear_all_data() to authenticated;

-- ---- log_view_as ----
-- The only DB object the view-as feature needs — everything else about it
-- is client-side only (no session is minted, no real permission change).
create function log_view_as(p_target uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor_email text;
  v_actor_full_name text;
  v_target_email text;
  v_target_full_name text;
  v_target_role user_role;
  v_target_status user_status;
  v_target_assembly_id uuid;
begin
  if not app_is_superadmin() then
    raise exception 'not allowed';
  end if;
  if p_action not in ('start', 'end') then
    raise exception 'invalid view-as action';
  end if;

  select email, full_name into v_actor_email, v_actor_full_name from profiles where id = auth.uid();
  select email, full_name, role, status, assembly_id
    into v_target_email, v_target_full_name, v_target_role, v_target_status, v_target_assembly_id
    from profiles where id = p_target;

  insert into activity_log (actor_id, actor_email, actor_full_name, action_type, target_type, target_id, assembly_id, details)
  values (auth.uid(), coalesce(v_actor_email, ''), coalesce(v_actor_full_name, ''),
    'view_as.' || p_action, 'profile', p_target, v_target_assembly_id,
    jsonb_build_object('target_email', v_target_email, 'target_full_name', v_target_full_name,
      'target_role', v_target_role, 'target_status', v_target_status));
end $$;

grant execute on function log_view_as(uuid, text) to authenticated;
