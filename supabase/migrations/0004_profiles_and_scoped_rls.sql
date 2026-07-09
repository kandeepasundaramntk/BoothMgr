-- 0004: user profiles, roles, approval workflow, per-assembly scoped RLS.
--
-- Roles: admin (everything), assembly_poc (one assembly + approves its
-- members), member (one assembly). New signups start as pending members and
-- see no data until an admin or their assembly's POC approves them.
--
-- FIRST-ADMIN BOOTSTRAP: after applying this migration, sign up through the
-- app, then run in the Supabase SQL editor:
--   update profiles set role = 'admin', status = 'approved', assembly_id = null,
--     approved_at = now()
--   where email = 'you@example.org';
--
-- DASHBOARD SETTING: disable "Confirm email" (Authentication → Sign In /
-- Providers → Email) — the approval workflow is the gate, and with
-- confirmation off signUp returns a live session so the app can drop straight
-- to the waiting-for-approval screen.

create type user_role as enum ('admin', 'assembly_poc', 'member');
create type user_status as enum ('pending', 'approved', 'rejected');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- denormalized from auth.users: clients cannot read the auth schema
  email text not null default '',
  full_name text not null default '',
  phone text not null default '',
  role user_role not null default 'member',
  status user_status not null default 'pending',
  assembly_id uuid references assemblies(id),  -- null for admins
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index profiles_assembly_idx on profiles(assembly_id);
alter table profiles enable row level security;

-- Profile rows are created by trigger, not by the client — a signup that gets
-- interrupted after auth.users insert still ends up with a profile.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, phone, assembly_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'assembly_id', '')::uuid
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Users who signed in before profiles existed become pending members;
-- promote them via approve_user / the bootstrap SQL above.
insert into profiles (id, email)
select id, coalesce(email, '') from auth.users
on conflict (id) do nothing;

-- ---- security-definer helpers ----
-- These bypass RLS (so policies on profiles/booths can call them without
-- recursing) and are the single source of truth for "who may see what".
-- NB: not named current_role() — that's a reserved SQL keyword.

create function app_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create function app_is_approved() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and status = 'approved') $$;

create function app_assembly() returns uuid
language sql stable security definer set search_path = public as
$$ select assembly_id from profiles where id = auth.uid() $$;

create function app_is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select app_role() = 'admin' and app_is_approved() $$;

create function can_access_assembly(aid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select app_is_admin() or (app_is_approved() and app_assembly() = aid) $$;

create function can_access_booth(bid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from booths b where b.id = bid and can_access_assembly(b.assembly_id)) $$;

grant execute on function app_role(), app_is_approved(), app_assembly(),
  app_is_admin(), can_access_assembly(uuid), can_access_booth(uuid) to authenticated;

-- ---- replace the blanket authenticated policies with scoped ones ----

drop policy assemblies_authenticated_all on assemblies;
create policy assemblies_select on assemblies
  for select to authenticated using (can_access_assembly(id));
create policy assemblies_admin_insert on assemblies
  for insert to authenticated with check (app_is_admin());
create policy assemblies_admin_update on assemblies
  for update to authenticated using (app_is_admin()) with check (app_is_admin());
create policy assemblies_admin_delete on assemblies
  for delete to authenticated using (app_is_admin());

drop policy booths_authenticated_all on booths;
create policy booths_scoped_all on booths
  for all to authenticated
  using (can_access_assembly(assembly_id))
  with check (can_access_assembly(assembly_id));

do $$
declare t text;
begin
  foreach t in array array[
    'booth_party_votes','booth_caste_pct','booth_religion_pct',
    'booth_influencers','booth_actions'
  ] loop
    execute format('drop policy %I on %I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (can_access_booth(booth_id)) with check (can_access_booth(booth_id))',
      t || '_scoped_all', t
    );
  end loop;
end $$;

-- actions catalog keeps its select-only authenticated policy from 0001 —
-- it is a non-sensitive catalog already shipped in the client bundle.

-- profiles: self always; admin all; approved POC sees their assembly's rows.
-- No insert/update/delete policies — all writes go through the RPCs below
-- (RLS cannot restrict columns; a raw UPDATE would let a POC change roles).
create policy profiles_select on profiles
  for select to authenticated using (
    id = auth.uid()
    or app_is_admin()
    or (app_role() = 'assembly_poc' and app_is_approved() and assembly_id = app_assembly())
  );

-- ---- approval RPCs ----

create function can_manage_profile(target uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select app_is_admin()
    or (app_role() = 'assembly_poc' and app_is_approved()
        and (select assembly_id from profiles where id = target) = app_assembly())
$$;

create function approve_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_profile(target) then
    raise exception 'not allowed';
  end if;
  update profiles set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = target;
end $$;

create function reject_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_profile(target) then
    raise exception 'not allowed';
  end if;
  update profiles set status = 'rejected', approved_by = auth.uid(), approved_at = now()
  where id = target;
end $$;

create function set_user_role(target uuid, new_role user_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app_is_admin() then
    raise exception 'not allowed';
  end if;
  if new_role <> 'admin'
     and (select role from profiles where id = target) = 'admin'
     and (select count(*) from profiles
          where role = 'admin' and status = 'approved' and id <> target) = 0 then
    raise exception 'cannot demote the last admin';
  end if;
  update profiles set role = new_role where id = target;
end $$;

grant execute on function can_manage_profile(uuid), approve_user(uuid),
  reject_user(uuid), set_user_role(uuid, user_role) to authenticated;

-- ---- signup assembly dropdown ----
-- The signup form runs before authentication, so it cannot read the
-- assemblies table. Deliberate, signed-off exception to the no-anon rule:
-- this RPC exposes assembly id + name ONLY (public electoral constituency
-- names — no booths, no campaign data), and there is still no table-level
-- anon policy anywhere.
create function signup_assemblies() returns table (id uuid, name text)
language sql stable security definer set search_path = public as
$$ select id, name from assemblies order by name $$;

grant execute on function signup_assemblies() to anon, authenticated;
