# Superadmin role — design

## Problem

Today there is a single `admin` role that does everything: creates/manages
assemblies (app setup), approves/rejects any pending user, and
promotes/demotes members to assembly POC. We want to split this into two
tiers:

- **superadmin** — manages the app's own setup: the assembly list itself,
  and who holds admin/superadmin privileges.
- **admin** — day-to-day administration: approving/rejecting users across
  all assemblies, promoting/demoting members ↔ assembly POC. Everything the
  current `admin` role does *except* touching assemblies or the admin
  roster.

Superadmin is a strict superset of admin — a superadmin can do everything an
admin can, plus the two extra powers above. A lone superadmin can run the
whole app without a separate admin account.

`assembly_poc` and `member` are unchanged.

## Non-goals

- No change to `assembly_poc` / `member` behavior.
- No data migration for existing rows — migration `0004` is unreleased (not
  yet applied to any live Supabase project), so it's edited in place rather
  than layered with a new migration.
- No change to how `assembly_id` is populated at signup.

## Data model

`user_role` enum gains a fourth value:

```sql
create type user_role as enum ('superadmin', 'admin', 'assembly_poc', 'member');
```

Like `admin` today, a `superadmin` profile always has `assembly_id = null`
(system-wide scope). No new columns — role alone continues to drive both
scope and permissions, per the existing "role enum + security-definer
helpers is the single source of truth" pattern documented in `0004`'s
header comment.

`assembly_id` is **not** touched by role changes (see "Role-change RPC"
below) — it's informational once someone is admin/superadmin (bypassed by
`app_is_admin()`), and demoting back down naturally restores assembly-scoped
access using whichever assembly the person originally signed up under.

## Permission helpers (SQL)

- **`app_is_superadmin()`** *(new)*: `app_role() = 'superadmin' and app_is_approved()`.
- **`app_is_admin()`** *(broadened)*: `app_role() in ('admin','superadmin') and app_is_approved()`.
  Everything already gated on `app_is_admin()` — `can_access_assembly`'s
  admin branch, `approve_user`/`reject_user`/`can_manage_profile` — keeps
  working for both admins and superadmins automatically, with no further
  changes needed to those functions.

## RLS policy changes

`assemblies` insert/update/delete policies move from `app_is_admin()` to
`app_is_superadmin()` (superadmin-only "app setup"). The `assemblies_select`
policy is unchanged (`can_access_assembly()` — everyone with access still
reads their scope; admin/superadmin read all, via `app_is_admin()`'s
short-circuit inside `can_access_assembly`).

No other table's RLS policies change.

## Role-change RPC (`set_user_role`)

Current signature: `set_user_role(target uuid, new_role user_role)`,
admin-only, allows setting any role, guards against demoting the last
approved admin.

New rules:

- Setting `new_role` to or from `'admin'` or `'superadmin'` requires
  `app_is_superadmin()`.
- Setting `new_role` to or from `'assembly_poc'`/`'member'` (i.e. neither
  side of the change touches admin/superadmin) still only requires
  `app_is_admin()` — regular admins keep today's POC/member promotion
  power unchanged.
- The "cannot demote the last one" guard extends to protect the last
  approved **superadmin** (in addition to the existing admin-count check,
  which stays as-is for symmetry — though in practice a superadmin
  demotion is the one that matters most, since a superadmin can always
  create more admins).
- `assembly_id` is never modified by this RPC, for any transition.

`approve_user` / `reject_user` / `can_manage_profile` are unchanged — they
already resolve through the broadened `app_is_admin()`.

## Bootstrap

The bootstrap comment/SQL snippet at the top of `0004` changes to set
`role = 'superadmin'` (not `'admin'`) for the first user:

```sql
update profiles set role = 'superadmin', status = 'approved', assembly_id = null,
  approved_at = now()
where email = 'you@example.org';
```

`README.md` and `DEPLOYMENT.md` get the same one-word update to their
bootstrap instructions.

## Client-side changes

- **`src/types.ts`**: `UserRole` becomes
  `'superadmin' | 'admin' | 'assembly_poc' | 'member'`.
- **`src/data/roles.ts`**: `ROLE_LABEL` gains
  `superadmin: { ta: 'மேல்நிர்வாகி', en: 'Super Admin' }`.
- **`src/data/api.ts`** (`DataApi.setProfileRole`): signature widens from
  `Extract<UserRole, 'assembly_poc' | 'member'>` to the full `UserRole` —
  the server RPC (and `demoApi`'s mirrored simulation) is what actually
  enforces who can set what, so the client type stops being artificially
  narrow.
- **`src/data/supabaseApi.ts`**: `setProfileRole` (line 312) passes the new
  role straight through to the `set_user_role` RPC unchanged (permission
  enforcement is server-side) — only its type signature widens.
- **`src/data/demoApi.ts`**: mirror the same permission rules client-side
  (per `CLAUDE.md`'s "keep demoApi's role-scoping simulation consistent
  with the SQL" instruction). This file has five existing
  `me.role === 'admin'` checks that all need broadening to admin-or-
  superadmin, plus one new admin-vs-superadmin distinction — introduce a
  local helper to avoid repeating the OR:

  ```ts
  const isAdminLike = (r: UserRole) => r === 'admin' || r === 'superadmin'
  ```

  - `currentProfile` (line 242): unknown-email fallback becomes
    `store.profiles.find((p) => isAdminLike(p.role))`.
  - `listAssemblies` (line 270): `me.role === 'admin' ? ...` →
    `isAdminLike(me.role) ? ...`.
  - `listProfiles` (line 414): same substitution for the "sees everything"
    branch.
  - `approveProfile` / `rejectProfile` (lines 428, 440): `me.role === 'admin'`
    → `isAdminLike(me.role)` in the `allowed` check.
  - `setProfileRole` (line 449): replace the flat
    `if (me.role !== 'admin') throw` with the new rule — throw unless
    (`isAdminLike(me.role)` **and** the change doesn't touch admin/superadmin
    on either side) **or** `me.role === 'superadmin'`. Also mirror the SQL
    RPC's last-admin and last-superadmin demotion guards here (reject a
    role change that would leave zero approved profiles with the target's
    current role, when that role is `'admin'` or `'superadmin'`).
  - **Seed data** (`seedProfiles`, line 67): the single seeded demo admin
    (`demo@example.com`, auto-signed-in per the existing demo-mode
    behavior) becomes `role: 'superadmin'` so the default demo session can
    exercise the new powers (add assembly, promote to admin) without manual
    setup. Add one more seeded profile, `role: 'admin'`, approved,
    `assembly_id: null`, so the plain-admin view (no add-assembly form, no
    admin-management control) is also directly reachable in demo mode by
    switching the session email.
- **`src/App.tsx`** (line 31): `canApprove` (drives whether the Approvals
  nav link renders) becomes
  `profile.role === 'admin' || profile.role === 'superadmin' || profile.role === 'assembly_poc'`.
- **`src/pages/AssembliesPage.tsx`** (line 36):
  - The "not admin → redirect to your own assembly" check becomes "not
    (admin or superadmin) → redirect."
  - The "Add assembly" form at the bottom of the page only renders for
    `role === 'superadmin'`. Plain admins see the full assemblies list
    (read-only — no add form).
- **`src/pages/ApprovalsPage.tsx`** (lines 17-18):
  - `canApprove` widens to include `'superadmin'`.
  - `isAdmin` (renamed `isAdminLike` for clarity) becomes
    `role === 'admin' || role === 'superadmin'` — the existing "Members"
    management table stays gated on this, now covering both tiers.
  - New `isSuperadmin = role === 'superadmin'` flag: when true, each row's
    role cell in the Members table becomes a `<select>`
    (member / assembly_poc / admin / superadmin) driving `setProfileRole`,
    replacing the current two hardcoded promote/demote buttons — avoids a
    combinatorial button set now that there are 4 roles.
  - Plain admins keep today's two-button Make POC / Make member toggle,
    unchanged (they still can't touch admin/superadmin rows — the RPC
    would reject it server-side even if the UI exposed it, but the UI
    simply won't offer it).

## Documentation

`CLAUDE.md`'s architecture section gets a line describing the four-role
model and the superadmin/admin split, next to the existing role
description.

## Testing / verification

No unit tests in this repo (per `CLAUDE.md`). Verification is manual, in
demo mode (`VITE_DEMO=1 npm run dev`) per the `verify` skill:

- Default demo session (`demo@example.com`, now seeded as superadmin):
  confirm the "Add assembly" form appears and works, and the Members table
  role selector can promote a member to admin.
- Switch the demo session to the new seeded `role: 'admin'` profile's
  email: confirm the "Add assembly" form is gone, the Members table still
  shows the two-button POC/member toggle, and there's no control to
  promote anyone to admin/superadmin.
- Confirm demoting the sole superadmin is blocked (try it from the
  superadmin session against itself, once only one superadmin exists).
- Confirm an admin still promotes member ↔ assembly_poc successfully.
