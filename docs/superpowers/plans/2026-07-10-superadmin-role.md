# Superadmin Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single `admin` role into `superadmin` (owns the assembly list and the admin/superadmin roster) and `admin` (day-to-day approvals and POC/member management), with `superadmin` a strict superset of `admin`.

**Architecture:** Add `'superadmin'` as a fourth value on the existing `user_role` Postgres enum and TypeScript union. Broaden the existing `app_is_admin()` SQL helper to treat superadmin as admin-equivalent everywhere admin already had access; add a new `app_is_superadmin()` helper for the two superadmin-only powers (assemblies CRUD, admin/superadmin role changes). Mirror every permission check on the client (`demoApi.ts`'s five simulated-RLS checks, plus three page-level gates) so demo mode and the real backend agree, per the codebase's existing "keep demoApi consistent with the SQL" rule.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase Postgres/Auth/RLS, no unit test framework (per `CLAUDE.md` — verification is `tsc -b` typecheck + manually driving the app in demo mode).

## Global Constraints

- Superadmin is a strict superset of admin — never build a check that lets admin do something superadmin can't.
- `assembly_id` is never modified by any role-change code path, for any role transition.
- Migration `0004_profiles_and_scoped_rls.sql` is unreleased (not applied to any live Supabase project yet) — edit it in place, do not add a new migration file.
- Superadmin Tamil/English label: `{ ta: 'மேல்நிர்வாகி', en: 'Super Admin' }`.
- `src/data/demoApi.ts`'s role-scoping simulation must stay behaviorally consistent with the SQL RLS/RPC logic (existing project rule, restated in `CLAUDE.md`).
- No automated test framework exists in this repo. Every code task's verification step is `npx tsc -b` (must exit with no errors) run from `K:\NTK2.0\BoothMgr`. The final task is a manual end-to-end pass in demo mode, per the project's `verify` skill.

---

### Task 1: Widen the `UserRole` type and add the superadmin label

**Files:**
- Modify: `src/types.ts:6`
- Modify: `src/data/roles.ts:3-7`

**Interfaces:**
- Produces: `UserRole = 'superadmin' | 'admin' | 'assembly_poc' | 'member'` (consumed by every later task) and `ROLE_LABEL.superadmin: { ta: string; en: string }` (consumed by Task 7's role `<select>`).

- [ ] **Step 1: Widen `UserRole` in `src/types.ts`**

Change line 6 from:

```ts
export type UserRole = 'admin' | 'assembly_poc' | 'member'
```

to:

```ts
export type UserRole = 'superadmin' | 'admin' | 'assembly_poc' | 'member'
```

- [ ] **Step 2: Add the superadmin label in `src/data/roles.ts`**

Change:

```ts
export const ROLE_LABEL: Record<UserRole, { ta: string; en: string }> = {
  admin: { ta: 'நிர்வாகி', en: 'Admin' },
  assembly_poc: { ta: 'தொகுதி பொறுப்பாளர்', en: 'Assembly POC' },
  member: { ta: 'உறுப்பினர்', en: 'Member' },
}
```

to:

```ts
export const ROLE_LABEL: Record<UserRole, { ta: string; en: string }> = {
  superadmin: { ta: 'மேல்நிர்வாகி', en: 'Super Admin' },
  admin: { ta: 'நிர்வாகி', en: 'Admin' },
  assembly_poc: { ta: 'தொகுதி பொறுப்பாளர்', en: 'Assembly POC' },
  member: { ta: 'உறுப்பினர்', en: 'Member' },
}
```

(The `Record<UserRole, ...>` type forces this key to exist — omitting it is a compile error, which is why this step must land together with Step 1.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b` from `K:\NTK2.0\BoothMgr`
Expected: fails, listing every file that still narrows `UserRole` to `'assembly_poc' | 'member'` or switches on `role === 'admin'` without exhaustiveness. This is expected — those are fixed in Tasks 2-3 and 5-7. Confirm the errors are ONLY in `src/data/api.ts`, `src/data/supabaseApi.ts`, `src/data/demoApi.ts` (all reference `Extract<UserRole, 'assembly_poc' | 'member'>`, which still compiles fine as a narrower type — so there should in fact be **no** errors from this step alone). If `tsc -b` reports zero errors, that confirms the narrowing types elsewhere still compile (they do — `Extract<...>` doesn't require exhaustiveness). Proceed either way.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/data/roles.ts
git commit -m "Widen UserRole to include superadmin"
```

---

### Task 2: Widen the `setProfileRole` interface and Supabase passthrough

**Files:**
- Modify: `src/data/api.ts:46`
- Modify: `src/data/supabaseApi.ts:312`

**Interfaces:**
- Consumes: `UserRole` from Task 1.
- Produces: `DataApi.setProfileRole(userId: string, role: UserRole): Promise<void>` (consumed by Task 3's demoApi implementation and Task 7's UI).

- [ ] **Step 1: Widen the interface in `src/data/api.ts`**

Change line 46 from:

```ts
  setProfileRole(userId: string, role: Extract<UserRole, 'assembly_poc' | 'member'>): Promise<void>
```

to:

```ts
  setProfileRole(userId: string, role: UserRole): Promise<void>
```

Also update the doc comment immediately above it (currently `/** Admin only: promote a member to assembly POC or demote back. */`) to:

```ts
  /**
   * Change a user's role. Promoting/demoting between assembly_poc and
   * member requires admin or superadmin; any change touching admin or
   * superadmin requires superadmin. Enforced server-side (RLS/RPC) and
   * mirrored in demoApi.
   */
```

- [ ] **Step 2: Widen the Supabase implementation's signature in `src/data/supabaseApi.ts`**

Change line 312 from:

```ts
    async setProfileRole(userId: string, role: Extract<UserRole, 'assembly_poc' | 'member'>): Promise<void> {
```

to:

```ts
    async setProfileRole(userId: string, role: UserRole): Promise<void> {
```

The body (`db.rpc('set_user_role', { target: userId, new_role: role })`) is unchanged — it already passes `role` straight through, and permission enforcement is server-side (Task 4's RPC).

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b` from `K:\NTK2.0\BoothMgr`
Expected: fails with one error, in `src/data/demoApi.ts`, because its `setProfileRole` still declares the narrower `Extract<UserRole, 'assembly_poc' | 'member'>` parameter type, which no longer satisfies the `DataApi` interface. This is expected — fixed in Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/data/api.ts src/data/supabaseApi.ts
git commit -m "Widen DataApi.setProfileRole to accept the full UserRole"
```

---

### Task 3: Update `demoApi.ts` — permission checks, guards, and seed data

**Files:**
- Modify: `src/data/demoApi.ts:67-106` (seed data)
- Modify: `src/data/demoApi.ts:239-243` (`currentProfile`)
- Modify: `src/data/demoApi.ts:263-272` (`listAssemblies`)
- Modify: `src/data/demoApi.ts:410-420` (`listProfiles`)
- Modify: `src/data/demoApi.ts:422-444` (`approveProfile` / `rejectProfile`)
- Modify: `src/data/demoApi.ts:446-454` (`setProfileRole`)
- Modify: `.claude/skills/verify/SKILL.md` (seed user description)

**Interfaces:**
- Consumes: `DataApi.setProfileRole(userId: string, role: UserRole): Promise<void>` from Task 2.
- Produces: `isAdminLike(role: UserRole): boolean` helper (local to this file, not exported — later tasks don't need it since it's demo-only plumbing). Two demo accounts: `demo@example.com` (superadmin) and `admin@demo.example` (admin), both approved.

- [ ] **Step 1: Add the `isAdminLike` helper**

In `src/data/demoApi.ts`, immediately before the `currentProfile` function (currently starting at line 239), add:

```ts
const isAdminLike = (role: UserRole): boolean => role === 'admin' || role === 'superadmin'
```

- [ ] **Step 2: Update `currentProfile`'s fallback**

Change:

```ts
function currentProfile(store: Store): Profile {
  const email = sessionStorage.getItem(DEMO_SESSION_KEY)
  const match = store.profiles.find((p) => p.email === email)
  return match ?? store.profiles.find((p) => p.role === 'admin') ?? store.profiles[0]
}
```

to:

```ts
function currentProfile(store: Store): Profile {
  const email = sessionStorage.getItem(DEMO_SESSION_KEY)
  const match = store.profiles.find((p) => p.email === email)
  return match ?? store.profiles.find((p) => isAdminLike(p.role)) ?? store.profiles[0]
}
```

- [ ] **Step 3: Broaden `listAssemblies`**

Change:

```ts
      const visible =
        me.role === 'admin' ? store.assemblies : store.assemblies.filter((a) => a.id === me.assembly_id)
```

to:

```ts
      const visible =
        isAdminLike(me.role) ? store.assemblies : store.assemblies.filter((a) => a.id === me.assembly_id)
```

- [ ] **Step 4: Broaden `listProfiles`**

Change:

```ts
      const visible =
        me.role === 'admin'
          ? store.profiles
          : me.role === 'assembly_poc'
            ? store.profiles.filter((p) => p.assembly_id === me.assembly_id || p.id === me.id)
            : store.profiles.filter((p) => p.id === me.id)
```

to:

```ts
      const visible =
        isAdminLike(me.role)
          ? store.profiles
          : me.role === 'assembly_poc'
            ? store.profiles.filter((p) => p.assembly_id === me.assembly_id || p.id === me.id)
            : store.profiles.filter((p) => p.id === me.id)
```

- [ ] **Step 5: Broaden `approveProfile` and `rejectProfile`**

In `approveProfile`, change:

```ts
      const allowed =
        me.role === 'admin' || (me.role === 'assembly_poc' && target.assembly_id === me.assembly_id)
```

to:

```ts
      const allowed =
        isAdminLike(me.role) || (me.role === 'assembly_poc' && target.assembly_id === me.assembly_id)
```

Make the identical change in `rejectProfile` (same line shape, different function).

- [ ] **Step 6: Rewrite `setProfileRole` with tier-aware permission and last-of-role guards**

Change:

```ts
    async setProfileRole(userId: string, role: Extract<UserRole, 'assembly_poc' | 'member'>): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      if (me.role !== 'admin') throw new Error('அனுமதி இல்லை (not allowed)')
      const target = store.profiles.find((p) => p.id === userId)
      if (!target) throw new Error('User not found')
      target.role = role
      persist(store)
    },
```

to:

```ts
    async setProfileRole(userId: string, role: UserRole): Promise<void> {
      const store = load()
      const me = currentProfile(store)
      const target = store.profiles.find((p) => p.id === userId)
      if (!target) throw new Error('User not found')
      const currentRole = target.role
      const touchesAdminTier =
        currentRole === 'admin' || currentRole === 'superadmin' || role === 'admin' || role === 'superadmin'
      if (touchesAdminTier ? me.role !== 'superadmin' : !isAdminLike(me.role)) {
        throw new Error('அனுமதி இல்லை (not allowed)')
      }
      if (
        role !== currentRole &&
        (currentRole === 'admin' || currentRole === 'superadmin') &&
        store.profiles.filter((p) => p.id !== target.id && p.role === currentRole && p.status === 'approved')
          .length === 0
      ) {
        throw new Error(
          currentRole === 'superadmin'
            ? 'கடைசி மேல்நிர்வாகியை பதவி நீக்கம் செய்ய முடியாது (cannot demote the last superadmin)'
            : 'கடைசி நிர்வாகியை பதவி நீக்கம் செய்ய முடியாது (cannot demote the last admin)',
        )
      }
      target.role = role
      persist(store)
    },
```

This mirrors Task 4's SQL RPC exactly: same-tier changes (POC ↔ member) need admin-or-superadmin; anything touching admin/superadmin needs superadmin; and the last approved holder of `'admin'` or `'superadmin'` can't be reassigned away from that role.

- [ ] **Step 7: Update seed data**

Change `seedProfiles` from:

```ts
function seedProfiles(assemblyId: string | null): Profile[] {
  return [
    {
      id: uuid(),
      email: 'demo@example.com',
      full_name: 'மாதிரி நிர்வாகி (Demo Admin)',
      phone: '00000 00000',
      role: 'admin',
      status: 'approved',
      assembly_id: null,
    },
    {
      id: uuid(),
      email: 'poc@demo.example',
      full_name: 'மாதிரி பொறுப்பாளர் (Demo POC)',
      phone: '00000 00010',
      role: 'assembly_poc',
      status: 'approved',
      assembly_id: assemblyId,
    },
```

to:

```ts
function seedProfiles(assemblyId: string | null): Profile[] {
  return [
    {
      id: uuid(),
      email: 'demo@example.com',
      full_name: 'மாதிரி மேல்நிர்வாகி (Demo Super Admin)',
      phone: '00000 00000',
      role: 'superadmin',
      status: 'approved',
      assembly_id: null,
    },
    {
      id: uuid(),
      email: 'admin@demo.example',
      full_name: 'மாதிரி நிர்வாகி (Demo Admin)',
      phone: '00000 00011',
      role: 'admin',
      status: 'approved',
      assembly_id: null,
    },
    {
      id: uuid(),
      email: 'poc@demo.example',
      full_name: 'மாதிரி பொறுப்பாளர் (Demo POC)',
      phone: '00000 00010',
      role: 'assembly_poc',
      status: 'approved',
      assembly_id: assemblyId,
    },
```

(The `pending1@demo.example` / `pending2@demo.example` entries below are unchanged — leave them as-is.)

- [ ] **Step 8: Update the `verify` skill's seed-user description**

In `.claude/skills/verify/SKILL.md`, change:

```
Seed users (fictional): `demo@example.com` = approved admin (also what any
*unknown* email resolves to, so "any email signs in" still acts as admin);
`poc@demo.example` = approved assembly POC of the demo assembly;
`pending1@demo.example` / `pending2@demo.example` = pending members, so the
Approvals page is testable out of the box. The demo session email lives in
sessionStorage `boothmgr-demo-session`.
```

to:

```
Seed users (fictional): `demo@example.com` = approved superadmin (also what
any *unknown* email resolves to, so "any email signs in" still acts as
superadmin); `admin@demo.example` = approved admin (can approve/reject and
manage assembly_poc/member roles, but can't add assemblies or touch the
admin roster); `poc@demo.example` = approved assembly POC of the demo
assembly; `pending1@demo.example` / `pending2@demo.example` = pending
members, so the Approvals page is testable out of the box. The demo session
email lives in sessionStorage `boothmgr-demo-session`.
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc -b` from `K:\NTK2.0\BoothMgr`
Expected: no errors (this was the last file with a stale `Extract<UserRole, ...>` signature).

- [ ] **Step 10: Commit**

```bash
git add src/data/demoApi.ts .claude/skills/verify/SKILL.md
git commit -m "Mirror superadmin permission rules in demoApi and seed a demo admin account"
```

---

### Task 4: SQL migration — superadmin enum value, helpers, RLS, and RPC

**Files:**
- Modify: `supabase/migrations/0004_profiles_and_scoped_rls.sql`

**Interfaces:**
- Produces: `user_role` enum with `'superadmin'`; `app_is_superadmin()` SQL function; broadened `app_is_admin()`; `assemblies_superadmin_insert/update/delete` policies; rewritten `set_user_role(target uuid, new_role user_role)` RPC. Nothing in this task is consumed by TypeScript code (the client only calls the RPC by name, unchanged) — it's the server-side twin of Task 3's demoApi logic.

- [ ] **Step 1: Update the header comment and bootstrap SQL**

Change (lines 1-16):

```sql
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
```

to:

```sql
-- 0004: user profiles, roles, approval workflow, per-assembly scoped RLS.
--
-- Roles: superadmin (everything admin can do, plus owns the assembly list
-- and the admin/superadmin roster), admin (approves users, promotes/
-- demotes assembly_poc/member — cannot touch assemblies or admin/
-- superadmin roles), assembly_poc (one assembly + approves its members),
-- member (one assembly). New signups start as pending members and see no
-- data until an admin/superadmin or their assembly's POC approves them.
--
-- FIRST-SUPERADMIN BOOTSTRAP: after applying this migration, sign up
-- through the app, then run in the Supabase SQL editor:
--   update profiles set role = 'superadmin', status = 'approved', assembly_id = null,
--     approved_at = now()
--   where email = 'you@example.org';
--
-- DASHBOARD SETTING: disable "Confirm email" (Authentication → Sign In /
-- Providers → Email) — the approval workflow is the gate, and with
-- confirmation off signUp returns a live session so the app can drop straight
-- to the waiting-for-approval screen.
```

- [ ] **Step 2: Add `'superadmin'` to the enum**

Change:

```sql
create type user_role as enum ('admin', 'assembly_poc', 'member');
```

to:

```sql
create type user_role as enum ('superadmin', 'admin', 'assembly_poc', 'member');
```

- [ ] **Step 3: Add `app_is_superadmin()` and broaden `app_is_admin()`**

Change:

```sql
create function app_is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select app_role() = 'admin' and app_is_approved() $$;
```

to:

```sql
create function app_is_superadmin() returns boolean
language sql stable security definer set search_path = public as
$$ select app_role() = 'superadmin' and app_is_approved() $$;

create function app_is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select app_role() in ('admin', 'superadmin') and app_is_approved() $$;
```

- [ ] **Step 4: Grant execute on the new function**

Change:

```sql
grant execute on function app_role(), app_is_approved(), app_assembly(),
  app_is_admin(), can_access_assembly(uuid), can_access_booth(uuid) to authenticated;
```

to:

```sql
grant execute on function app_role(), app_is_approved(), app_assembly(),
  app_is_admin(), app_is_superadmin(), can_access_assembly(uuid), can_access_booth(uuid) to authenticated;
```

- [ ] **Step 5: Move assemblies write policies to superadmin-only**

Change:

```sql
create policy assemblies_admin_insert on assemblies
  for insert to authenticated with check (app_is_admin());
create policy assemblies_admin_update on assemblies
  for update to authenticated using (app_is_admin()) with check (app_is_admin());
create policy assemblies_admin_delete on assemblies
  for delete to authenticated using (app_is_admin());
```

to:

```sql
create policy assemblies_superadmin_insert on assemblies
  for insert to authenticated with check (app_is_superadmin());
create policy assemblies_superadmin_update on assemblies
  for update to authenticated using (app_is_superadmin()) with check (app_is_superadmin());
create policy assemblies_superadmin_delete on assemblies
  for delete to authenticated using (app_is_superadmin());
```

(`assemblies_select`, using `can_access_assembly()`, is unchanged — admins and superadmins both still read everything via that function's `app_is_admin()` short-circuit.)

- [ ] **Step 6: Rewrite `set_user_role` with tier-aware permission and last-of-role guards**

Change:

```sql
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
```

to:

```sql
create function set_user_role(target uuid, new_role user_role) returns void
language plpgsql security definer set search_path = public as $$
declare
  current_role user_role;
begin
  select role into current_role from profiles where id = target;

  if current_role in ('admin', 'superadmin') or new_role in ('admin', 'superadmin') then
    if not app_is_superadmin() then
      raise exception 'not allowed';
    end if;
  elsif not app_is_admin() then
    raise exception 'not allowed';
  end if;

  if new_role <> current_role
     and current_role in ('admin', 'superadmin')
     and (select count(*) from profiles
          where role = current_role and status = 'approved' and id <> target) = 0 then
    raise exception 'cannot demote the last %', current_role;
  end if;

  update profiles set role = new_role where id = target;
end $$;
```

- [ ] **Step 7: Verify**

There is no local Postgres instance in this repo to run the migration against. Verify by:
1. Reading the full modified file top to bottom and confirming every `app_is_admin()` call site that should now also match superadmin still reads correctly (it does, automatically, via Step 3's broadened definition — `approve_user`, `reject_user`, `can_manage_profile`, `booths_scoped_all` via `can_access_assembly`/`can_access_booth`, `profiles_select` are all unchanged text but now behave correctly for superadmin too).
2. Confirming `assemblies_select`, `booths_scoped_all`, the five `*_scoped_all` per-booth-child-table policies, `profiles_select`, `approve_user`, `reject_user`, `can_manage_profile`, and `signup_assemblies()` are byte-for-byte unchanged from before this task (grep the file for `app_is_admin` — every remaining call site outside the ones touched in Steps 3-6 should be identical to the pre-task version).
3. This SQL is exercised for real once applied to a Supabase project (see `DEPLOYMENT.md`) — Task 3's demoApi mirror is what gets exercised in Task 9's manual verification pass.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0004_profiles_and_scoped_rls.sql
git commit -m "Add superadmin role to RLS/RPC layer: assemblies CRUD and admin roster moved to superadmin-only"
```

---

### Task 5: Widen the Approvals nav-link gate in `App.tsx`

**Files:**
- Modify: `src/App.tsx:31`

**Interfaces:**
- Consumes: `UserRole` from Task 1 (no new interface produced — this is a leaf UI check).

- [ ] **Step 1: Broaden `canApprove`**

Change:

```ts
  const canApprove = approved && (profile.role === 'admin' || profile.role === 'assembly_poc')
```

to:

```ts
  const canApprove =
    approved && (profile.role === 'admin' || profile.role === 'superadmin' || profile.role === 'assembly_poc')
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b` from `K:\NTK2.0\BoothMgr`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "Show the Approvals nav link for superadmins"
```

---

### Task 6: Gate `AssembliesPage.tsx`'s redirect and add-form on role

**Files:**
- Modify: `src/pages/AssembliesPage.tsx:36`
- Modify: `src/pages/AssembliesPage.tsx:95-105`

**Interfaces:**
- Consumes: `UserRole` from Task 1, `profile` from `useAuth()` (already destructured at the top of this file).

- [ ] **Step 1: Broaden the non-admin redirect check**

Change:

```tsx
  // Field workers belong to one assembly — take them straight there.
  if (profile && profile.role !== 'admin') {
```

to:

```tsx
  // Field workers belong to one assembly — take them straight there.
  if (profile && profile.role !== 'admin' && profile.role !== 'superadmin') {
```

- [ ] **Step 2: Gate the "Add assembly" form to superadmin only**

Change:

```tsx
      <form className="toolbar" style={{ marginTop: 14 }} onSubmit={onSubmit}>
        <input
          placeholder={t('புதிய தொகுதியின் பெயர்', 'New assembly name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <button className="btn" type="submit" disabled={create.isPending || !name.trim()}>
          {t('சேர்', 'Add')}
        </button>
      </form>
```

to:

```tsx
      {profile?.role === 'superadmin' && (
        <form className="toolbar" style={{ marginTop: 14 }} onSubmit={onSubmit}>
          <input
            placeholder={t('புதிய தொகுதியின் பெயர்', 'New assembly name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ minWidth: 260 }}
          />
          <button className="btn" type="submit" disabled={create.isPending || !name.trim()}>
            {t('சேர்', 'Add')}
          </button>
        </form>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b` from `K:\NTK2.0\BoothMgr`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AssembliesPage.tsx
git commit -m "Restrict assembly creation to superadmin; admins keep read access"
```

---

### Task 7: Add superadmin role management to `ApprovalsPage.tsx`

**Files:**
- Modify: `src/pages/ApprovalsPage.tsx`

**Interfaces:**
- Consumes: `UserRole`, `ROLE_LABEL` (with `superadmin` key) from Task 1; `DataApi.setProfileRole(userId, role: UserRole)` from Task 2.

- [ ] **Step 1: Import `UserRole`**

Change:

```ts
import type { Profile } from '../types'
```

to:

```ts
import type { Profile, UserRole } from '../types'
```

- [ ] **Step 2: Broaden `canApprove`, rename/broaden `isAdmin`, add `isSuperadmin`**

Change:

```ts
  const canApprove = me?.role === 'admin' || me?.role === 'assembly_poc'
  const isAdmin = me?.role === 'admin'
```

to:

```ts
  const canApprove = me?.role === 'admin' || me?.role === 'superadmin' || me?.role === 'assembly_poc'
  const isAdminLike = me?.role === 'admin' || me?.role === 'superadmin'
  const isSuperadmin = me?.role === 'superadmin'
```

- [ ] **Step 3: Widen the `setRole` mutation's argument type**

Change:

```ts
  const setRole = useMutation({
    mutationFn: async (args: { id: string; role: 'assembly_poc' | 'member' }) =>
      (await getApi()).setProfileRole(args.id, args.role),
    onSuccess: onDone,
    onError,
  })
```

to:

```ts
  const setRole = useMutation({
    mutationFn: async (args: { id: string; role: UserRole }) => (await getApi()).setProfileRole(args.id, args.role),
    onSuccess: onDone,
    onError,
  })
```

- [ ] **Step 4: Update the Members section gate**

Change:

```tsx
      {isAdmin && others.length > 0 && (
```

to:

```tsx
      {isAdminLike && others.length > 0 && (
```

- [ ] **Step 5: Replace the row action cell with a superadmin role selector**

Change:

```tsx
                  <td>
                    {p.role === 'member' && p.status === 'approved' && (
                      <button
                        className="btn small secondary"
                        disabled={busy}
                        onClick={() => setRole.mutate({ id: p.id, role: 'assembly_poc' })}
                      >
                        {t('பொறுப்பாளராக்கு', 'Make POC')}
                      </button>
                    )}
                    {p.role === 'assembly_poc' && (
                      <button
                        className="btn small secondary"
                        disabled={busy}
                        onClick={() => setRole.mutate({ id: p.id, role: 'member' })}
                      >
                        {t('உறுப்பினராக்கு', 'Make member')}
                      </button>
                    )}
                    {p.status === 'rejected' && (
                      <button className="btn small" disabled={busy} onClick={() => approve.mutate(p.id)}>
                        ✓ {t('ஒப்புதல்', 'Approve')}
                      </button>
                    )}
                  </td>
```

to:

```tsx
                  <td>
                    {isSuperadmin ? (
                      <select
                        value={p.role}
                        disabled={busy}
                        onChange={(e) => setRole.mutate({ id: p.id, role: e.target.value as UserRole })}
                      >
                        <option value="member">{t(ROLE_LABEL.member.ta, ROLE_LABEL.member.en)}</option>
                        <option value="assembly_poc">{t(ROLE_LABEL.assembly_poc.ta, ROLE_LABEL.assembly_poc.en)}</option>
                        <option value="admin">{t(ROLE_LABEL.admin.ta, ROLE_LABEL.admin.en)}</option>
                        <option value="superadmin">{t(ROLE_LABEL.superadmin.ta, ROLE_LABEL.superadmin.en)}</option>
                      </select>
                    ) : (
                      <>
                        {p.role === 'member' && p.status === 'approved' && (
                          <button
                            className="btn small secondary"
                            disabled={busy}
                            onClick={() => setRole.mutate({ id: p.id, role: 'assembly_poc' })}
                          >
                            {t('பொறுப்பாளராக்கு', 'Make POC')}
                          </button>
                        )}
                        {p.role === 'assembly_poc' && (
                          <button
                            className="btn small secondary"
                            disabled={busy}
                            onClick={() => setRole.mutate({ id: p.id, role: 'member' })}
                          >
                            {t('உறுப்பினராக்கு', 'Make member')}
                          </button>
                        )}
                      </>
                    )}
                    {p.status === 'rejected' && (
                      <button className="btn small" disabled={busy} onClick={() => approve.mutate(p.id)}>
                        ✓ {t('ஒப்புதல்', 'Approve')}
                      </button>
                    )}
                  </td>
```

Note: the row's role-label cell just above this (`<L ta={ROLE_LABEL[p.role].ta} en={ROLE_LABEL[p.role].en} />`) is unchanged — it already renders correctly for `'superadmin'` once Task 1's `ROLE_LABEL` entry exists.

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b` from `K:\NTK2.0\BoothMgr`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ApprovalsPage.tsx
git commit -m "Add superadmin role selector to the Approvals page"
```

---

### Task 8: Update documentation (README, DEPLOYMENT, CLAUDE.md)

**Files:**
- Modify: `README.md`
- Modify: `DEPLOYMENT.md`
- Modify: `CLAUDE.md:24-26`

**Interfaces:**
- None — documentation only, no code interfaces.

- [ ] **Step 1: Update `README.md`'s bootstrap instructions**

Change:

```markdown
6. **Bootstrap the first admin**: sign up through the app, then run in the
   Supabase SQL editor:

   ```sql
   update profiles set role = 'admin', status = 'approved', assembly_id = null,
     approved_at = now()
   where email = 'you@example.org';
   ```
```

to:

```markdown
6. **Bootstrap the first superadmin**: sign up through the app, then run in
   the Supabase SQL editor:

   ```sql
   update profiles set role = 'superadmin', status = 'approved', assembly_id = null,
     approved_at = now()
   where email = 'you@example.org';
   ```
```

- [ ] **Step 2: Update `README.md`'s role description**

Change:

```markdown
Anyone can sign up (`/signup`) with name, phone, email, password and their
assembly. They stay on a "waiting for approval" screen until approved from the
Approvals page by:

- **admin** — sees all assemblies, approves anyone, promotes members to
  assembly POC (and back) — never demote the last admin;
- **assembly POC** (தொகுதி பொறுப்பாளர்) — scoped to one assembly; approves or
  rejects that assembly's members;
- **member** — scoped to one assembly; edits its booth forms.
```

to:

```markdown
Anyone can sign up (`/signup`) with name, phone, email, password and their
assembly. They stay on a "waiting for approval" screen until approved from the
Approvals page by:

- **superadmin** — everything an admin can do, plus creates/manages the
  assembly list itself and promotes/demotes admins and other superadmins —
  never demote the last superadmin;
- **admin** — sees all assemblies, approves anyone, promotes members to
  assembly POC (and back) — cannot touch the assembly list or the
  admin/superadmin roster;
- **assembly POC** (தொகுதி பொறுப்பாளர்) — scoped to one assembly; approves or
  rejects that assembly's members;
- **member** — scoped to one assembly; edits its booth forms.
```

- [ ] **Step 3: Update `DEPLOYMENT.md`'s bootstrap section**

Change:

```markdown
5. **Bootstrap the first admin**: deploy the frontend first (step 2 below), sign up through
   `/signup` with your own account, then in the Supabase SQL Editor run:

   ```sql
   update profiles set role = 'admin', status = 'approved', assembly_id = null,
     approved_at = now()
   where email = 'you@example.org';
   ```

   Every subsequent user is approved through the app's Approvals page — this SQL step is only
   needed once, to create the first admin.
```

to:

```markdown
5. **Bootstrap the first superadmin**: deploy the frontend first (step 2 below), sign up through
   `/signup` with your own account, then in the Supabase SQL Editor run:

   ```sql
   update profiles set role = 'superadmin', status = 'approved', assembly_id = null,
     approved_at = now()
   where email = 'you@example.org';
   ```

   Every subsequent user is approved through the app's Approvals page — this SQL step is only
   needed once, to create the first superadmin. From there, promote others to admin or
   superadmin from the Approvals page.
```

- [ ] **Step 4: Update `CLAUDE.md`'s architecture section**

Change line 24 from:

```markdown
- `supabase/migrations/` — schema (`0001`), action seed (`0002`), long-pending-issues column (`0003`), profiles/roles/scoped RLS (`0004`). Every table has deny-by-default RLS scoped by role and assembly: `admin` sees all, `assembly_poc`/`member` only their own assembly (security-definer helpers `app_role()`/`can_access_assembly()`/`can_access_booth()`). Profile writes go through RPCs (`approve_user`, `reject_user`, `set_user_role`) — no direct update policies. Dashboard aggregates come from the SQL views `booth_completion`, `assembly_health_summary`, `action_progress` (mirrored by client-side math in `demoApi.ts` — keep them consistent, including its role-scoping simulation).
```

to:

```markdown
- `supabase/migrations/` — schema (`0001`), action seed (`0002`), long-pending-issues column (`0003`), profiles/roles/scoped RLS (`0004`). Every table has deny-by-default RLS scoped by role and assembly: `superadmin`/`admin` see all, `assembly_poc`/`member` only their own assembly (security-definer helpers `app_role()`/`app_is_admin()`/`app_is_superadmin()`/`can_access_assembly()`/`can_access_booth()`). `superadmin` is a strict superset of `admin` — it additionally owns the assembly list (assemblies CRUD) and the admin/superadmin roster, neither of which `admin` can touch. Profile writes go through RPCs (`approve_user`, `reject_user`, `set_user_role`) — no direct update policies. Dashboard aggregates come from the SQL views `booth_completion`, `assembly_health_summary`, `action_progress` (mirrored by client-side math in `demoApi.ts` — keep them consistent, including its role-scoping simulation).
```

Change line 25 from:

```markdown
- Users self-register (`/signup`, assembly dropdown via the anon `signup_assemblies()` RPC — the one deliberate anon exception, names only) and stay `pending` (no data access; `PendingApprovalPage`) until an admin or their assembly's POC approves them on `/approvals`. `AuthContext` exposes `profile` (role/status/assembly) next to `email`; the `Shell` guard in `App.tsx` enforces the pending screen; non-admins skip the assemblies list and land on their own assembly. First admin is bootstrapped by SQL (see README).
```

to:

```markdown
- Users self-register (`/signup`, assembly dropdown via the anon `signup_assemblies()` RPC — the one deliberate anon exception, names only) and stay `pending` (no data access; `PendingApprovalPage`) until an admin/superadmin or their assembly's POC approves them on `/approvals`. `AuthContext` exposes `profile` (role/status/assembly) next to `email`; the `Shell` guard in `App.tsx` enforces the pending screen; users who are neither admin nor superadmin skip the assemblies list and land on their own assembly. First superadmin is bootstrapped by SQL (see README).
```

Change line 26 from:

```markdown
- `src/pages/` — Login, Signup, PendingApproval, Approvals, Assemblies (admin only; others redirect), BoothList (CSV import/export), Booth (detail form as 4 topic tabs + 21-action checklist; `src/components/Tabs.tsx`), BoothPrint (paper-form layout), Dashboard.
```

to:

```markdown
- `src/pages/` — Login, Signup, PendingApproval, Approvals, Assemblies (admin/superadmin see the full list; only superadmin can add an assembly; others redirect), BoothList (CSV import/export), Booth (detail form as 4 topic tabs + 21-action checklist; `src/components/Tabs.tsx`), BoothPrint (paper-form layout), Dashboard.
```

- [ ] **Step 5: Commit**

```bash
git add README.md DEPLOYMENT.md CLAUDE.md
git commit -m "Update docs for the superadmin/admin split"
```

---

### Task 9: Final build check and manual end-to-end verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full lint + typecheck + production build**

Run from `K:\NTK2.0\BoothMgr`:

```bash
npm run lint
npm run build
```

Expected: both exit with no errors.

- [ ] **Step 2: Launch demo mode**

```bash
VITE_DEMO=1 npm run dev
```

Open `http://localhost:5173`. If localStorage already has old seed data from a prior run, clear the `boothmgr-demo-v1` key (DevTools → Application → Local Storage) so the updated `seedProfiles` from Task 3 takes effect.

- [ ] **Step 3: Verify the default (superadmin) session**

Auto-signed-in as `demo@example.com` (now superadmin). Confirm:
- Header shows the "Super Admin" role badge.
- `/` (Assemblies page) shows the assembly list AND the "Add assembly" form at the bottom; adding a new assembly succeeds.
- `/approvals` shows the Approvals nav link, the Pending table, and a Members table where every row's role cell is a `<select>` with 4 options.
- In the Members table, change `poc@demo.example` from Assembly POC to Admin via the dropdown — confirm it saves (re-fetch shows "Admin").
- Test the "demote a superadmin while another exists" path: while signed in as `demo@example.com`, promote `admin@demo.example` to Super Admin, then demote it back to Admin — both should succeed (two superadmins existed at the time of each change, so neither demotion ever targeted the last one).
- The "cannot demote the last superadmin" guard itself is not reachable through this UI: the signed-in user's own row is always excluded from the Members table (`others` filters out `p.id === me?.id`), so the only profile that could ever *be* "the last superadmin" is the acting superadmin's own row, which the table never lets them target. This mirrors the pre-existing "cannot demote the last admin" guard, which has the same property today and was accepted as UI-unreachable defense-in-depth. Skip live reproduction; instead confirm by inspection that Task 3 Step 6 (`demoApi.ts`) and Task 4 Step 6 (SQL) implement matching logic — both reject a same-role transition when it's the sole approved holder of `'admin'` or `'superadmin'`.

- [ ] **Step 4: Verify the plain-admin session**

Sign out, sign in as `admin@demo.example` (or whichever account holds the `admin` role after Step 3's shuffling — reset localStorage if the role state got confusing). Confirm:
- Header shows the "Admin" role badge.
- `/` shows the assembly list but **no** "Add assembly" form.
- `/approvals` shows the Members table with the original two-button Make POC / Make member toggle (no role `<select>`), and no way to promote anyone to admin/superadmin.

- [ ] **Step 5: Regression-check existing flows**

Per the `verify` skill's existing flow list — confirm these still work unchanged:
- Booth detail tabs (edit a field, Save, F5, confirm it survived).
- Registration loop: sign out → `/signup` → pending screen → sign in as superadmin → approve → new user lands on their assembly.
- Dashboard tiles and weakest-booths list.
- Print view.

- [ ] **Step 6: Report results**

If every check in Steps 3-5 passes, the feature is complete — no further commit needed for this task (verification-only). If any check fails, fix the specific broken file (identify which of Tasks 1-8 owns it), re-run that task's typecheck step, and re-verify from Step 2.
