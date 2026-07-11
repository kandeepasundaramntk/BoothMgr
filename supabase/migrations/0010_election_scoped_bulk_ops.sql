-- 0010: election-scope the superadmin bulk-operation RPCs from 0006.
--
-- Task 12 (0009) split `booths` into pure geography plus a new
-- `election_booths` table holding per-(election, booth) campaign data, and
-- added `election_id` to the five booth-child tables (re-scoping their
-- natural-key uniqueness to (election_id, booth_id, key)). As a result the
-- 0006 RPCs `restore_assembly_backup` / `bulk_create_assemblies` reference
-- columns that no longer live on `booths` and would error at CALL time
-- (plpgsql late-binds, so 0009 applied cleanly but calling them now fails).
--
-- This migration:
--   1. Replaces restore_assembly_backup with an election-scoped version:
--      geography upserts into `booths`, campaign scalars into
--      `election_booths`, child rows carry election_id. Backup format bumps
--      to version 2 (v1 backups are explicitly rejected).
--   2. Replaces bulk_create_assemblies to also accept the optional
--      parliament_constituency_id / constituency_code / district / state_code
--      per-entry fields added by Task 2.
--   3. Adds two new clear-by-election RPCs that wipe only campaign data
--      (election_booths + the five child tables) for one election, leaving
--      the reusable `booths` geography untouched.
--
-- clear_assembly_data / clear_all_data from 0006 are intentionally left
-- unchanged — see the note at the bottom of this file.

-- ============================================================
-- 1. restore_assembly_backup — now election-scoped
-- ============================================================
-- The old (uuid, jsonb) signature is dropped: it upserted campaign columns
-- into `booths`, which 0009 removed, so it can only error. The new signature
-- gains p_election_id between p_assembly_id and p_payload.
--
-- p_payload shape (format_version 2): {format_version:'2', exported_at,
-- assembly, booths: [{booth:{booth_number, village_ward_area, committed_pct,
-- swing_pct, opponent_pct, macro_trends, alliance_dynamics,
-- candidate_selection, media_narrative, anti_incumbency, beneficiary_mapping,
-- long_pending_issues}, partyVotes:[...], castes:[...], religions:[...],
-- influencers:[...], actions:[...]}]}.
--
-- Per booth: geography (booth_number, village_ward_area) upserts into
-- `booths` on conflict (assembly_id, booth_number); the campaign scalars
-- upsert into `election_booths` on conflict (election_id, booth_id) using the
-- booth id returned from the geography upsert. Each child upsert now carries
-- election_id and its on-conflict target includes election_id, matching
-- 0009's re-scoped constraints. Still one transaction — a mid-loop failure
-- rolls back the whole restore.
drop function if exists restore_assembly_backup(uuid, jsonb);

create function restore_assembly_backup(p_assembly_id uuid, p_election_id uuid, p_payload jsonb) returns jsonb
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

  -- Reject legacy v1 backups explicitly rather than guessing an election —
  -- a v1 payload's campaign data is not tagged with any election cycle.
  if p_payload->>'format_version' = '1' then
    raise exception 'format_version 1 backups are not supported after the election-cycle migration — re-export from a version 2+ backup, or contact support to migrate a v1 backup manually';
  end if;

  if coalesce(p_payload->>'format_version', '') <> '2' then
    raise exception 'unsupported backup format version';
  end if;

  if not exists (select 1 from assemblies where id = p_assembly_id) then
    raise exception 'assembly not found';
  end if;

  if not exists (select 1 from elections where id = p_election_id) then
    raise exception 'election not found';
  end if;

  for v_booth in select value from jsonb_array_elements(coalesce(p_payload->'booths', '[]'::jsonb)) as value
  loop
    -- Geography only — booths no longer holds any campaign columns (0009).
    insert into booths (assembly_id, booth_number, village_ward_area)
    values (
      p_assembly_id,
      v_booth->'booth'->>'booth_number',
      coalesce(v_booth->'booth'->>'village_ward_area', '')
    )
    on conflict (assembly_id, booth_number) do update set
      village_ward_area = excluded.village_ward_area
    returning id into v_booth_id;

    -- Campaign scalars for this (election, booth) — keyed by the id just
    -- returned from the geography upsert.
    insert into election_booths (
      election_id, booth_id,
      committed_pct, swing_pct, opponent_pct,
      macro_trends, alliance_dynamics, candidate_selection,
      media_narrative, anti_incumbency, beneficiary_mapping, long_pending_issues
    ) values (
      p_election_id, v_booth_id,
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
    on conflict (election_id, booth_id) do update set
      committed_pct = excluded.committed_pct,
      swing_pct = excluded.swing_pct,
      opponent_pct = excluded.opponent_pct,
      macro_trends = excluded.macro_trends,
      alliance_dynamics = excluded.alliance_dynamics,
      candidate_selection = excluded.candidate_selection,
      media_narrative = excluded.media_narrative,
      anti_incumbency = excluded.anti_incumbency,
      beneficiary_mapping = excluded.beneficiary_mapping,
      long_pending_issues = excluded.long_pending_issues;

    -- Counted once per booth from the election_booths upsert, not from both
    -- tables — booths_upserted still means "distinct booths touched".
    v_booths_upserted := v_booths_upserted + 1;

    for v_child in select value from jsonb_array_elements(coalesce(v_booth->'partyVotes', '[]'::jsonb)) as value
    loop
      insert into booth_party_votes (booth_id, election_id, party_name, votes)
      values (v_booth_id, p_election_id, v_child->>'party_name', (v_child->>'votes')::integer)
      on conflict (election_id, booth_id, party_name) do update set votes = excluded.votes;
      v_party_votes_upserted := v_party_votes_upserted + 1;
    end loop;

    for v_child in select value from jsonb_array_elements(coalesce(v_booth->'castes', '[]'::jsonb)) as value
    loop
      insert into booth_caste_pct (booth_id, election_id, caste_name, pct)
      values (v_booth_id, p_election_id, v_child->>'caste_name', (v_child->>'pct')::numeric)
      on conflict (election_id, booth_id, caste_name) do update set pct = excluded.pct;
      v_castes_upserted := v_castes_upserted + 1;
    end loop;

    for v_child in select value from jsonb_array_elements(coalesce(v_booth->'religions', '[]'::jsonb)) as value
    loop
      insert into booth_religion_pct (booth_id, election_id, religion_name, pct)
      values (v_booth_id, p_election_id, v_child->>'religion_name', (v_child->>'pct')::numeric)
      on conflict (election_id, booth_id, religion_name) do update set pct = excluded.pct;
      v_religions_upserted := v_religions_upserted + 1;
    end loop;

    for v_child in select value from jsonb_array_elements(coalesce(v_booth->'influencers', '[]'::jsonb)) as value
    loop
      insert into booth_influencers (booth_id, election_id, name, contact, role_note)
      values (v_booth_id, p_election_id, v_child->>'name', coalesce(v_child->>'contact', ''), coalesce(v_child->>'role_note', ''))
      on conflict (election_id, booth_id, name) do update set contact = excluded.contact, role_note = excluded.role_note;
      v_influencers_upserted := v_influencers_upserted + 1;
    end loop;

    for v_child in select value from jsonb_array_elements(coalesce(v_booth->'actions', '[]'::jsonb)) as value
    loop
      insert into booth_actions (booth_id, election_id, action_id, status, notes, updated_by)
      values (v_booth_id, p_election_id, (v_child->>'action_id')::integer, (v_child->>'status')::action_status, coalesce(v_child->>'notes', ''), auth.uid())
      on conflict (election_id, booth_id, action_id) do update set
        status = excluded.status, notes = excluded.notes, updated_by = excluded.updated_by;
      v_actions_upserted := v_actions_upserted + 1;
    end loop;
  end loop;

  select email, full_name into v_actor_email, v_actor_full_name from profiles where id = auth.uid();
  -- One summary row, not the whole payload again — the per-row triggers on
  -- booths/election_booths/booth_party_votes/etc. already captured every
  -- individual change during the loop above; re-embedding it all here would
  -- just double the blast radius of a leaked log for zero informational benefit.
  insert into activity_log (actor_id, actor_email, actor_full_name, action_type, target_type, target_id, assembly_id, details)
  values (auth.uid(), coalesce(v_actor_email, ''), coalesce(v_actor_full_name, ''),
    'backup.restore', 'assembly', p_assembly_id, p_assembly_id,
    jsonb_build_object('election_id', p_election_id, 'booths_count', v_booths_upserted, 'source_exported_at', p_payload->>'exported_at'));

  return jsonb_build_object(
    'booths_upserted', v_booths_upserted,
    'party_votes_upserted', v_party_votes_upserted,
    'castes_upserted', v_castes_upserted,
    'religions_upserted', v_religions_upserted,
    'influencers_upserted', v_influencers_upserted,
    'actions_upserted', v_actions_upserted
  );
end $$;

grant execute on function restore_assembly_backup(uuid, uuid, jsonb) to authenticated;

-- ============================================================
-- 2. bulk_create_assemblies — read optional geography/PC fields
-- ============================================================
-- Signature unchanged (jsonb) so create-or-replace is enough. Per-entry
-- shape gains four optional fields matching Task 2's assemblies columns:
-- parliament_constituency_id, constituency_code, district, state_code. All
-- nullable-with-default at the column level, so a missing key falls through
-- to the column default (only name stays required). Skip-and-report on name
-- collision is preserved; on collision the nested booths still apply against
-- the existing assembly (idempotent re-upload).
create or replace function bulk_create_assemblies(p_payload jsonb) returns jsonb
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

    -- Optional PC / geography fields. parliament_constituency_id is nullable
    -- (0007), so an absent/empty value becomes NULL. constituency_code,
    -- district and state_code are NOT NULL DEFAULT columns — an explicit NULL
    -- would violate the constraint (the default only applies when the column
    -- is omitted), so a missing/empty value is coalesced to that same default
    -- ('' / '' / 'TN') to reproduce Task 2's column behavior. A colliding
    -- (skipped) entry keeps whatever the existing assembly already has.
    insert into assemblies (name, parliament_constituency_id, constituency_code, district, state_code)
    values (
      v_name,
      nullif(v_entry->>'parliament_constituency_id', '')::uuid,
      coalesce(nullif(v_entry->>'constituency_code', ''), ''),
      coalesce(nullif(v_entry->>'district', ''), ''),
      coalesce(nullif(v_entry->>'state_code', ''), 'TN')
    )
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

-- ============================================================
-- 3. clear_assembly_election_data — wipe one assembly's campaign data
--    for one election, keeping its booths geography
-- ============================================================
-- Deletes election_booths + the five child tables for the (assembly,
-- election) pair. Does NOT touch `booths` (geography survives) or any other
-- election's data. Deleting election_booths does not cascade to the child
-- tables (they FK booths/elections, not election_booths), so each is deleted
-- explicitly. Superadmin-gated with the same guard as clear_assembly_data.
create function clear_assembly_election_data(p_assembly_id uuid, p_election_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_booths integer;
  v_party integer;
  v_castes integer;
  v_religions integer;
  v_influencers integer;
  v_actions integer;
  v_actor_email text;
  v_actor_full_name text;
begin
  if not app_is_superadmin() then
    raise exception 'not allowed';
  end if;

  delete from booth_party_votes where election_id = p_election_id
    and booth_id in (select id from booths where assembly_id = p_assembly_id);
  get diagnostics v_party = row_count;

  delete from booth_caste_pct where election_id = p_election_id
    and booth_id in (select id from booths where assembly_id = p_assembly_id);
  get diagnostics v_castes = row_count;

  delete from booth_religion_pct where election_id = p_election_id
    and booth_id in (select id from booths where assembly_id = p_assembly_id);
  get diagnostics v_religions = row_count;

  delete from booth_influencers where election_id = p_election_id
    and booth_id in (select id from booths where assembly_id = p_assembly_id);
  get diagnostics v_influencers = row_count;

  delete from booth_actions where election_id = p_election_id
    and booth_id in (select id from booths where assembly_id = p_assembly_id);
  get diagnostics v_actions = row_count;

  delete from election_booths where election_id = p_election_id
    and booth_id in (select id from booths where assembly_id = p_assembly_id);
  get diagnostics v_booths = row_count;

  select email, full_name into v_actor_email, v_actor_full_name from profiles where id = auth.uid();
  insert into activity_log (actor_id, actor_email, actor_full_name, action_type, target_type, target_id, assembly_id, details)
  values (auth.uid(), coalesce(v_actor_email, ''), coalesce(v_actor_full_name, ''),
    'data.clear_assembly_election', 'assembly', p_assembly_id, p_assembly_id,
    jsonb_build_object('election_id', p_election_id, 'booths_affected', v_booths,
      'party_votes_deleted', v_party, 'castes_deleted', v_castes, 'religions_deleted', v_religions,
      'influencers_deleted', v_influencers, 'actions_deleted', v_actions));

  return v_booths;
end $$;

-- ============================================================
-- 4. clear_election_data — same, system-wide (no assembly filter)
-- ============================================================
create function clear_election_data(p_election_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_booths integer;
  v_party integer;
  v_castes integer;
  v_religions integer;
  v_influencers integer;
  v_actions integer;
  v_actor_email text;
  v_actor_full_name text;
begin
  if not app_is_superadmin() then
    raise exception 'not allowed';
  end if;

  delete from booth_party_votes where election_id = p_election_id;
  get diagnostics v_party = row_count;

  delete from booth_caste_pct where election_id = p_election_id;
  get diagnostics v_castes = row_count;

  delete from booth_religion_pct where election_id = p_election_id;
  get diagnostics v_religions = row_count;

  delete from booth_influencers where election_id = p_election_id;
  get diagnostics v_influencers = row_count;

  delete from booth_actions where election_id = p_election_id;
  get diagnostics v_actions = row_count;

  delete from election_booths where election_id = p_election_id;
  get diagnostics v_booths = row_count;

  select email, full_name into v_actor_email, v_actor_full_name from profiles where id = auth.uid();
  insert into activity_log (actor_id, actor_email, actor_full_name, action_type, target_type, target_id, assembly_id, details)
  values (auth.uid(), coalesce(v_actor_email, ''), coalesce(v_actor_full_name, ''),
    'data.clear_election', 'system', null, null,
    jsonb_build_object('election_id', p_election_id, 'booths_affected', v_booths,
      'party_votes_deleted', v_party, 'castes_deleted', v_castes, 'religions_deleted', v_religions,
      'influencers_deleted', v_influencers, 'actions_deleted', v_actions));

  return v_booths;
end $$;

grant execute on function clear_assembly_election_data(uuid, uuid), clear_election_data(uuid) to authenticated;

-- ============================================================
-- 5. clear_assembly_data / clear_all_data — intentionally UNCHANGED
-- ============================================================
-- 0006's clear_assembly_data(uuid) and clear_all_data() still `delete from
-- booths ...`. After 0009 that cascade chain still holds: election_booths and
-- all five child tables FK booth_id `on delete cascade`, so deleting a booth
-- still removes its campaign data across EVERY election. That is the intended
-- "nuclear" option (remove the geography and everything hanging off it), so
-- no code change is needed here — the two new clear-by-election RPCs above
-- are the narrower, geography-preserving alternative.
