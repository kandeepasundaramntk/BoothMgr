# Task breakdown: Parliamentary Constituencies, Election Cycles, Navigation Fixes, Booths-as-Tab, De-branding

Source design doc: `C:\Users\chera\.claude\plans\inherited-prancing-kahan.md` (approved by user). This file breaks that plan into discrete, independently-dispatchable tasks for subagent-driven-development. Tasks are numbered in dependency order — do not reorder.

## Global constraints (apply to every task)

- Migrations are strictly additive and sequential in `supabase/migrations/`, starting at `0007`. NEVER edit `0001`–`0006`.
- Every new `DataApi` capability MUST be implemented in BOTH `src/data/supabaseApi.ts` (real) AND `src/data/demoApi.ts` (localStorage mirror), kept behaviorally consistent — this is a hard project rule (CLAUDE.md).
- Bilingual UI: every user-facing label is a `<L ta="..." en="..." />` or `t('ta', 'en')` pair via `src/i18n.tsx` — no i18n framework, no English-only strings in the UI.
- RLS is deny-by-default. New tables need `alter table X enable row level security` plus explicit policies — never leave a table with RLS enabled and zero policies unless that's the deliberate "writes only via security-definer RPC" pattern already used by `profiles`/`activity_log`.
- SQL variable names in any `plpgsql` function use a `v_` prefix (established project convention, avoids Postgres reserved-word collisions — a real bug was caught and fixed for this exact reason earlier in this project's history).
- `npx tsc -b`, `npm run lint`, `npm run build` must all be clean before a task is considered done. There is no unit test suite — verification is typecheck/lint/build plus, where practical, a manual demo-mode check (`VITE_DEMO=1 npm run dev`).
- Never use `service_role` anywhere in client code (DEPLOYMENT.md hard rule).
- Commit at the end of each task with a clear message; do not amend prior commits.

---

## Task 1: Navigation back-links

Add a back-link to the two pages that currently have none.

**Files:** `src/pages/ApprovalsPage.tsx`, `src/pages/SuperadminToolsPage.tsx`

Add, immediately above the `<h2 className="page-title">` in each file:
```tsx
<div className="toolbar">
  <Link to="/">← {t('தொகுதிகள்', 'Assemblies')}</Link>
</div>
```
Matches the existing convention already used in `src/pages/BoothPage.tsx:116`, `src/pages/DashboardPage.tsx:79`, `src/pages/BoothPrintPage.tsx:50`, `src/pages/BlankFormPage.tsx:11` — read one of those for the exact pattern (import `Link` from `react-router-dom` if not already imported; both files already import `useT`/have a `t` in scope — verify before assuming).

No other changes. This task has no dependency on anything else in this plan.

---

## Task 2: Migration 0007 — parliament_constituencies + assembly fields

**File:** new `supabase/migrations/0007_parliament_constituencies.sql`

1. New table `parliament_constituencies`:
   - `id uuid primary key default gen_random_uuid()`
   - `name text not null unique`
   - `pc_code text not null default ''`
   - `state_code text not null default 'TN'`
   - `created_at timestamptz not null default now()`
2. `alter table assemblies add column parliament_constituency_id uuid references parliament_constituencies(id)` (nullable), plus `constituency_code text not null default ''`, `district text not null default ''`, `state_code text not null default 'TN'`.
3. `create index assemblies_pc_idx on assemblies(parliament_constituency_id)`.
4. RLS on `parliament_constituencies`: `alter table parliament_constituencies enable row level security`. Policy `pc_authenticated_read for select to authenticated using (true)` — same non-sensitive-electoral-geography precedent as the existing `signup_assemblies()` RPC and the `actions` catalog's `actions_authenticated_read` policy (see `supabase/migrations/0001_schema.sql` for that policy's exact shape). Insert/update/delete gated by `app_is_superadmin()` (the helper is defined in `supabase/migrations/0004_profiles_and_scoped_rls.sql` — reuse it, do not redefine it).
5. Extend the activity-log trigger set from `supabase/migrations/0005_activity_log.sql`: read that file's `log_activity()` function first. Add `create trigger parliament_constituencies_activity_log after insert or update or delete on parliament_constituencies for each row execute function log_activity();` and add a new branch to the function's `case TG_TABLE_NAME` — `when 'parliament_constituencies' then v_assembly_id := null; v_target_id := (v_row->>'id')::uuid;` — inserted as its own migration statement that alters the existing function (`create or replace function log_activity() ...` — you must reproduce the ENTIRE function body from `0005_activity_log.sql` with this one branch added, since `create or replace` replaces the whole function; do not attempt a partial patch). No new branch needed for the `assemblies` table's new columns — it's already logged via the full-diff `else` branch since it's not one of the three redacted tables.

Read `supabase/migrations/0004_profiles_and_scoped_rls.sql` and `0005_activity_log.sql` in full before writing this file — you need their exact helper function names and the `log_activity()` body to extend correctly.

---

## Task 3: types.ts + api.ts — Parliament Constituency & Assembly-field contracts

**Files:** `src/types.ts`, `src/data/api.ts`

In `types.ts`:
- `ParliamentConstituency { id: string; name: string; pc_code: string; state_code: string; created_at: string }`
- Extend `Assembly` (currently `{ id: string; name: string }`) with `parliament_constituency_id: string | null`, `constituency_code: string`, `district: string`, `state_code: string`.

In `api.ts` (`DataApi` interface):
- Change `createAssembly(name: string): Promise<void>` to `createAssembly(input: { name: string; parliament_constituency_id?: string | null; constituency_code?: string; district?: string; state_code?: string }): Promise<void>` — **this is a breaking signature change**; find and note (do not fix yet, that's Task 4/6) the current call site in `src/pages/AssembliesPage.tsx`.
- Add `updateAssembly(id: string, patch: Partial<Pick<Assembly, 'parliament_constituency_id' | 'constituency_code' | 'district' | 'state_code'>>): Promise<void>`.
- Add `listParliamentConstituencies(): Promise<ParliamentConstituency[]>`.
- Add `createParliamentConstituency(input: { name: string; pc_code?: string; state_code?: string }): Promise<void>`.

Do NOT implement these in `supabaseApi.ts`/`demoApi.ts` yet (Task 4) — this task is the interface/type contract only. It's fine (and expected) for `npx tsc -b` to fail after this task alone, since the two implementations won't satisfy the new interface yet — note this in your report so the reviewer isn't surprised; Task 4 fixes it.

---

## Task 4: supabaseApi.ts + demoApi.ts — Parliament Constituency & Assembly-field implementations

**Files:** `src/data/supabaseApi.ts`, `src/data/demoApi.ts`

Implements the interface changes from Task 3 in both files. Read `src/data/api.ts` first for the exact signatures now required.

**`supabaseApi.ts`:**
- `createAssembly(input)` — `.from('assemblies').insert({ name: input.name, parliament_constituency_id: input.parliament_constituency_id ?? null, constituency_code: input.constituency_code ?? '', district: input.district ?? '', state_code: input.state_code ?? 'TN' })`. Find and update the existing `createAssembly` implementation's current shape for the exact pattern (error handling, etc.) to match.
- `updateAssembly(id, patch)` — `.from('assemblies').update(patch).eq('id', id)`.
- `listParliamentConstituencies()` — `.from('parliament_constituencies').select('*').order('name')`.
- `createParliamentConstituency(input)` — `.from('parliament_constituencies').insert({ name: input.name, pc_code: input.pc_code ?? '', state_code: input.state_code ?? 'TN' })`.
- Also update `listAssemblies()`'s existing `.select(...)` column list to include the four new columns (find the current select statement — likely `'id, name'` or `'*'`; if it's already `'*'` no change needed, but verify).

**`demoApi.ts`:**
- Read the existing `Store` interface and `createAssembly` implementation first.
- `Store.assemblies` items need the four new fields — find where assemblies are seeded/created and backfill: existing demo assemblies get `parliament_constituency_id: null, constituency_code: '', district: '', state_code: 'TN'` via the store's existing `load()` versioned-upgrade pattern (find how `long_pending_issues ??= ''` or similar backfills are done in `load()` and follow the same pattern — do not bump `STORE_KEY`).
- Add `Store.parliamentConstituencies: ParliamentConstituency[]` (empty array default via the same `load()` backfill pattern).
- Implement `createAssembly(input)`, `updateAssembly(id, patch)`, `listParliamentConstituencies()`, `createParliamentConstituency(input)` as plain array operations, matching the style of existing methods in the file (e.g. `createBooth`, `importBooths`) for id generation (`crypto.randomUUID()` or whatever the file already uses — check) and persistence (`save(store)` or equivalent — check the existing pattern).
- These new writes are superadmin-only per the project's established demoApi convention (every existing superadmin-only method in this file opens with a role check — find one, e.g. in the existing bulk-ops methods from a prior feature, and match its exact guard/error-message style).
- Call `logActivity(...)` for `createAssembly` (already logs today — extend the details object if needed, don't remove the existing call) and add new `logActivity` calls for `createParliamentConstituency`/`updateAssembly`/`parliament_constituencies.insert` etc., matching the `action_type` string convention `<table>.<op>` already used elsewhere in this file (e.g. `'assemblies.insert'` already exists — follow that exact naming pattern for `'parliament_constituencies.insert'`, `'assemblies.update'`).

After this task: `npx tsc -b` must be clean (Task 3's interface is now fully implemented), `npm run lint` clean.

---

## Task 5: Parliament Constituency pages + routes

**Files:** new `src/pages/ParliamentConstituenciesPage.tsx`, new `src/pages/ParliamentConstituencyDashboardPage.tsx`, `src/App.tsx`

Read `src/pages/AssembliesPage.tsx` in full first — these two new pages are directly modeled on it (same list-with-superadmin-only-create-form pattern, same `useQuery`/`useMutation` react-query style, same bilingual `<L>`/`t()` usage, same `card`/`page-title`/`toolbar` CSS classes).

`ParliamentConstituenciesPage.tsx` (route `/parliament-constituencies`):
- Lists all PCs (`listParliamentConstituencies()` via `useQuery`) in a table: name, pc_code, state_code, and a link to `/parliament-constituencies/:id`.
- Superadmin-only create form (name + pc_code + state_code inputs) calling `createParliamentConstituency` via `useMutation`, invalidating the PC list query on success — mirror `AssembliesPage.tsx`'s create-assembly form exactly for the gating logic (only superadmin sees the form; check how that page determines "am I superadmin" — likely `useEffectiveProfile()`, confirm and reuse it, not `useAuth()` directly, per this project's view-as convention).
- Add the back-link toolbar pattern from Task 1.

`ParliamentConstituencyDashboardPage.tsx` (route `/parliament-constituencies/:pcId`):
- Fetches the PC's own record (from `listParliamentConstituencies()`, find by id — there's no `getParliamentConstituency(id)` single-fetch method, don't add one, just filter client-side like `AssembliesPage.tsx` does for its own list) and lists member assemblies: `listAssemblies()` filtered client-side where `parliament_constituency_id === pcId`.
- Show a placeholder note where the aggregate health-rollup (avg committed/swing/opponent %) will go: `<p className="hint"><L ta="..." en="Aggregate health rollup will appear here once election-scoped dashboards are wired up." /></p>` — this is intentional, the real `pc_health_summary` view doesn't exist until Task 12; do not attempt to fetch health data in this task.
- Each member-assembly row links to `/assembly/:id` (the existing route).
- Back-link to `/parliament-constituencies`.

`App.tsx`:
- Add both routes inside the `Shell` route block (same place as the existing `/admin` route), lazy-imported like the other pages (`const ParliamentConstituenciesPage = lazy(() => import('./pages/ParliamentConstituenciesPage'))`, same for the dashboard page).
- Add a header nav link "Parliament Constituencies" / "நாடாளுமன்றத் தொகுதிகள்" visible when `isSuperadmin || canApprove` is true (i.e. same gate as the existing `isSuperadmin` Admin Tools link — check whether PCs should be admin-visible too; default to the same `isSuperadmin`-only gate as Admin Tools unless you find evidence plain `admin` should see it too — there's none in the plan, so `isSuperadmin`-only is correct) — read the existing header JSX in `Shell()` for the exact `<Link className="btn small secondary" to="...">` pattern to copy.

---

## Task 6: AssembliesPage.tsx — PC field display, create-form fields, inline edit

**File:** `src/pages/AssembliesPage.tsx`

Read the file in full first (it's ~111 lines per prior exploration).

1. Add a "Parliament Constituency" column to the assemblies table, showing the PC name (resolve via a `listParliamentConstituencies()` query, find-by-id against `assembly.parliament_constituency_id`) or `—` if null.
2. Extend the existing create-assembly form (currently a single `name` text input, superadmin-only) with: a PC `<select>` (options from `listParliamentConstituencies()`, empty/`—` option for "none"), and text inputs for constituency code, district, state code. Wire all four into the now-object-shaped `createAssembly(input)` call from Task 4.
3. Add an inline, superadmin-only edit affordance per row for the four new fields (PC dropdown + 3 text inputs, each row gets its own small "Save" button or an on-blur auto-save — match whatever inline-edit pattern already exists elsewhere in this codebase if one does; if none exists, use a simple per-row "Edit" toggle revealing the four inputs plus a Save button calling the new `updateAssembly(id, patch)`, invalidating the assemblies query on success). This is net-new UI surface (assemblies have no edit affordance today) — keep it minimal, don't over-build (no modal, no separate edit page).

Do NOT add health-summary chips in this task — `listAssemblySummaries`/election-scoped views don't exist yet (that's Task 18, after Task 12's migration lands).

---

## Task 7: Migration 0008 — elections table

**File:** new `supabase/migrations/0008_elections.sql`

1. `create type election_status as enum ('upcoming', 'active', 'archived');`
2. `create table elections (id uuid primary key default gen_random_uuid(), name text not null, year integer not null, status election_status not null default 'upcoming', created_at timestamptz not null default now());`
3. RLS: `alter table elections enable row level security;` — `elections_authenticated_read for select to authenticated using (true)` (every role needs the list for the header picker — this is not sensitive data, it's just campaign-cycle metadata), insert/update/delete gated by `app_is_superadmin()`.
4. Activity-log: same pattern as Task 2's PC trigger — add `elections_activity_log` trigger and a `when 'elections'` branch to `log_activity()`'s `case` (again, reproduce the full function body via `create or replace function log_activity()`, now including BOTH the `parliament_constituencies` branch from Task 2's migration AND this new `elections` branch — read `0007_parliament_constituencies.sql` first to see its exact `create or replace function log_activity()` body and extend it rather than starting over from the original `0005` version).

---

## Task 8: types.ts + api.ts — Election contracts

**Files:** `src/types.ts`, `src/data/api.ts`

`types.ts`: `Election { id: string; name: string; year: number; status: 'upcoming' | 'active' | 'archived'; created_at: string }`.

`api.ts` (`DataApi`):
- `listElections(): Promise<Election[]>`
- `createElection(input: { name: string; year: number }): Promise<void>` (new elections default to `status: 'upcoming'` server-side per the migration's column default — don't accept status on create)
- `setElectionStatus(id: string, status: Election['status']): Promise<void>`

Interface-only, like Task 3 — implementations are Task 9. Note the expected `tsc -b` failure in your report.

---

## Task 9: supabaseApi.ts + demoApi.ts — Election implementations

**Files:** `src/data/supabaseApi.ts`, `src/data/demoApi.ts`

Mirrors Task 4's structure exactly, for the Task 8 interface.

**`supabaseApi.ts`:** `listElections()` (`.from('elections').select('*').order('year', {ascending: false})`), `createElection(input)`, `setElectionStatus(id, status)` (`.from('elections').update({status}).eq('id', id)`).

**`demoApi.ts`:** Add `Store.elections: Election[]` via the `load()` backfill pattern (default `[]`). Implement the three methods as array operations matching existing style. Superadmin-only guards + `logActivity` calls, same convention as Task 4 (`action_type` strings `'elections.insert'`, `'elections.update'`).

Verify `npx tsc -b`/`npm run lint` clean after this task.

---

## Task 10: ElectionContext + header picker + dynamic subtitle

**Files:** new `src/election/ElectionContext.tsx`, `src/App.tsx`

Read `src/auth/AuthContext.tsx` in full first — `ElectionContext` structurally mirrors it (provider pattern, hook export, localStorage persistence — check how, if at all, `AuthContext` or elsewhere in the app already reads/writes `localStorage`, e.g. the demo-mode session key, for the project's established key-naming style).

`ElectionContext.tsx`:
- `ElectionProvider` component: on mount, `listElections()` via a manual fetch or `useQuery` (check whether context providers elsewhere in this app use react-query inside them, or plain `useEffect`+`useState` — `AuthContext` likely uses plain state since it predates data fetching; follow whatever pattern fits best without introducing a new one gratuitously).
- State: `activeElectionId: string | null`, seeded by: read `localStorage['boothmgr-active-election']`; if that election id exists in the fetched list, use it; otherwise fall back to the election with `status === 'active'`; otherwise `null`.
- `setActiveElectionId(id)` — updates state AND `localStorage.setItem('boothmgr-active-election', id)`.
- Export `useActiveElection()` hook returning `{ activeElectionId, activeElection: Election | null, elections: Election[], setActiveElectionId }`.
- Export `ElectionProvider` for wiring into `App.tsx`.

`App.tsx`:
- Wrap the existing provider tree with `<ElectionProvider>` (check the current nesting order of `QueryClientProvider`/`AuthProvider`/`LangProvider`/`BrowserRouter` and place `ElectionProvider` sensibly — likely inside `AuthProvider` since election data requires being signed in, but outside `BrowserRouter` since it's not route-dependent; use your judgment and state your reasoning in the report).
- In `Shell()`: replace the hardcoded subtitle `t('2026 இடைத்தேர்தல்', '2026 By-Election', ' — ')` (currently at `src/App.tsx:61` per prior exploration — verify the exact line, code may have shifted after Tasks 1/5) with the active election's name from `useActiveElection()`, falling back to a generic placeholder (e.g. `t('தேர்தல் தேர்ந்தெடுக்கப்படவில்லை', 'No election selected')`) if `activeElection` is null.
- Add an election `<select>` in the header, next to the existing language-toggle button, listing `elections` (value=id, label=`${name} (${year})`), calling `setActiveElectionId` on change. Only render it if `elections.length > 0` (avoid an empty/broken dropdown before any election exists — a fresh install has zero elections until a superadmin creates the bootstrap one via Task 11's Elections tab).

This task does NOT yet thread `electionId` into any booth-related `DataApi` calls — that's Task 17 onward, after Task 12's migration exists. This task only makes the concept selectable and visible.

---

## Task 11: SuperadminToolsPage — Elections tab

**Files:** `src/pages/superadmin/ElectionsTab.tsx` (new), `src/pages/SuperadminToolsPage.tsx`

Read `src/pages/SuperadminToolsPage.tsx` in full and one existing tab component (e.g. `src/pages/superadmin/UsersTab.tsx`) for the exact structural pattern to follow.

`ElectionsTab.tsx`: lists elections (`listElections()`), a create form (name + year, superadmin-only — this whole page is already gated superadmin-only by its parent, no extra role check needed inside the tab), and a per-row status control (a `<select>` of `upcoming/active/archived` calling `setElectionStatus`, or three small buttons — match whatever control style `UsersTab.tsx`/`ApprovalsPage.tsx` already use for similar per-row state changes).

`SuperadminToolsPage.tsx`: add `'elections'` to the `SuperadminTab` union type and the `TABS` array (found at `src/pages/SuperadminToolsPage.tsx:14` per prior exploration), rendering `<ElectionsTab />` when selected. Follow the exact existing pattern for the other 5 tabs.

---

## Task 12: Migration 0009 — election-scope campaign data (the big one)

**File:** new `supabase/migrations/0009_election_scope_campaign_data.sql`

**This is the highest-risk file in the entire plan. Read `supabase/migrations/0001_schema.sql`, `0004_profiles_and_scoped_rls.sql`, `0005_activity_log.sql` (as extended by Tasks 2/7 — read the CURRENT state of the file after those migrations, not the original), and `0006_superadmin_bulk_ops.sql` in full before writing a single line.** Do not guess column names or existing constraint names — verify every one against the actual prior migration files in this repo.

Steps, in order (all in this one file — do not split across multiple migrations, the plan explicitly calls this one reviewable unit):

1. **Bootstrap election**: `insert into elections (name, year, status) values ('Tamil Nadu 2026 By-Election', 2026, 'active') returning id` — capture into a `do $$ declare v_bootstrap_id uuid; begin ... end $$;` block (the whole migration body from here can live inside one `do` block, or use a session variable / temp table if you need the id across multiple top-level statements — Postgres doesn't have cross-statement session variables outside `do` blocks or `set`, so structure accordingly; a common approach is a single large `do $$ ... $$` for the data-migration parts, with the DDL — table creation, column drops — as separate top-level statements before/after it, since `do` blocks can't contain DDL transaction-unsafely in all cases; use your judgment on the cleanest structure, but the whole file must be idempotent-safe to run once on a fresh-vs-populated database and must not leave the bootstrap id undiscoverable to later statements in the same file).
2. **New table `election_booths`**: `id uuid pk default gen_random_uuid()`, `election_id uuid not null references elections(id) on delete cascade`, `booth_id uuid not null references booths(id) on delete cascade`, `committed_pct numeric check (committed_pct between 0 and 100)`, `swing_pct numeric check (...)`, `opponent_pct numeric check (...)` (copy the exact check-constraint shape from `booths` in `0001_schema.sql`), the 6 free-text narrative columns (`macro_trends`, `alliance_dynamics`, `candidate_selection`, `media_narrative`, `anti_incumbency`, `beneficiary_mapping` — all `text not null default ''`, matching `0001_schema.sql`'s exact column list), `long_pending_issues text not null default ''` (added in `0003_long_pending_issues.sql` — same default), `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `unique(election_id, booth_id)`. Reuse the existing `set_updated_at()` trigger function (defined in `0001_schema.sql`) via `create trigger election_booths_updated_at before update on election_booths for each row execute function set_updated_at();`.
3. **Data migration**: copy every existing `booths` row's campaign columns into `election_booths` under the bootstrap election id — `insert into election_booths (election_id, booth_id, committed_pct, swing_pct, opponent_pct, macro_trends, alliance_dynamics, candidate_selection, media_narrative, anti_incumbency, beneficiary_mapping, long_pending_issues, created_at, updated_at) select v_bootstrap_id, id, committed_pct, ... from booths;` — must run BEFORE the column-drop step below.
4. **Add `election_id uuid references elections(id) on delete cascade`** to `booth_party_votes`, `booth_caste_pct`, `booth_religion_pct`, `booth_influencers`, `booth_actions` — add nullable first, `update <table> set election_id = v_bootstrap_id where election_id is null;` to backfill every existing row, THEN `alter table <table> alter column election_id set not null;`.
5. **Drop the old campaign columns from `booths`**: `committed_pct`, `swing_pct`, `opponent_pct`, the 6 narrative columns, `long_pending_issues`. Write a prominent `-- WARNING — DATA-LOSSY STEP` comment block above this, matching the style already used in `0006_superadmin_bulk_ops.sql`'s dedup-delete warning (read that file's exact warning-comment format and match it) — explain that data was copied to `election_booths` in step 3 first and this is safe IF step 3 ran successfully, but flag it for real-database caution the same way `0006` did for its own destructive step.
6. **Update constraints on the 5 child tables**: drop each existing `unique(booth_id, natural_key)` constraint (find their exact names — they were added in `0006_superadmin_bulk_ops.sql`, e.g. `booth_party_votes_booth_party_uk` — read that file for the exact constraint names) and add `unique(election_id, booth_id, natural_key)` in their place. `booth_actions`' composite primary key `(booth_id, action_id)` (from `0001_schema.sql`) becomes `(election_id, booth_id, action_id)` — dropping and recreating a primary key requires `alter table booth_actions drop constraint booth_actions_pkey, add primary key (election_id, booth_id, action_id);` (verify the actual PK constraint name via Postgres's default naming or by reading if `0001_schema.sql` named it explicitly).
7. **RLS**: `can_access_booth(bid)` (defined in `0004_profiles_and_scoped_rls.sql`) is unaffected — it's keyed off `booth_id → booths.assembly_id`, and `booths.assembly_id` doesn't move. The 5 existing child-table policies (`*_scoped_all`, from `0004_profiles_and_scoped_rls.sql`) keep working untouched — do not modify them. Add ONE new policy for `election_booths`: `alter table election_booths enable row level security; create policy election_booths_scoped_all on election_booths for all to authenticated using (can_access_booth(booth_id)) with check (can_access_booth(booth_id));` — mirror `booths_scoped_all`'s exact shape from `0004_profiles_and_scoped_rls.sql`.
8. **Activity log**: this is the trickiest part — read `log_activity()`'s CURRENT full body (after Tasks 2 and 7's extensions) before touching it. Move the `beneficiary_mapping` redaction special-case (currently a `TG_TABLE_NAME = 'booths'` branch, per the existing 0005 migration) to a new `TG_TABLE_NAME = 'election_booths'` branch (same redaction logic, same column name `beneficiary_mapping`, since it now lives on `election_booths` not `booths`). The old `'booths'` branch becomes dead code for that specific redaction — since `booths` no longer has `beneficiary_mapping` after step 5, its rows now correctly fall through to the generic full-diff `else` branch with NO code change needed to remove the old branch (the `case` statement's `when 'booths' then ... beneficiary_mapping ...` line referencing a now-dropped column would fail at function-definition time if left in place — you MUST remove or rewrite that branch, it cannot silently continue existing). Also add `election_id`/`v_assembly_id` resolution for `election_booths` in the `case TG_TABLE_NAME` block (resolve `v_assembly_id` the same way the other booth-child tables do: `select b.assembly_id into v_assembly_id from booths b where b.id = v_booth_id`). Add `create trigger election_booths_activity_log after insert or update or delete on election_booths for each row execute function log_activity();`. This entire step is one more `create or replace function log_activity()` with the full body (all branches from 0005+0007+0008+this task's changes).
9. **Redefine the 3 dashboard views** — `drop view booth_completion; drop view assembly_health_summary; drop view action_progress;` then recreate each with `election_id` added and joined through `elections`:
   - `booth_completion`: read its current definition in `0001_schema.sql`, add `election_id`, cross-join `elections`, left-join `booth_actions` on `(booth_id, election_id)` instead of just `booth_id`.
   - `assembly_health_summary`: add `election_id`, cross-join `elections` × `assemblies`, left-join `booths` then `election_booths` on `(booth_id, election_id)`.
   - `action_progress`: add `election_id` to the existing `actions × booths` cross-join (extend to `actions × booths × elections`), left-join `booth_actions` on `(booth_id, action_id, election_id)`.
   - Use `cross join elections` (not filtered) so every view naturally supports "show me zeros for elections with no data yet" when the client filters by `election_id` afterward — read `0001_schema.sql`'s exact `action_progress` view definition first since it's the one that already has this cross-join pattern for `booths`, and extend that same technique.
10. **New view `pc_health_summary`**: `elections × parliament_constituencies`, left-joined through `assemblies.parliament_constituency_id` → `booths` → `election_booths`, aggregating `count(distinct assemblies.id) as assembly_count`, `count(distinct booths.id) as booth_count`, `avg(election_booths.committed_pct) as avg_committed_pct`, `avg(...swing_pct)`, `avg(...opponent_pct)`, grouped by `(elections.id, parliament_constituencies.id)`. Add `with (security_invoker = true)` matching the other 3 views' exact declaration style from `0001_schema.sql`.

Verify the file is syntactically self-consistent by re-reading it fully once written, cross-checking every referenced table/column/constraint name against the actual prior migrations — this file will NOT be applied to any live database as part of this task (that's a separate, later step the user does manually per the plan's Verification section); your job is to produce a correct, reviewable SQL file, not to run it.

---

## Task 13: Migration 0010 — election-scoped bulk-op RPCs

**File:** new `supabase/migrations/0010_election_scoped_bulk_ops.sql`

Read `supabase/migrations/0006_superadmin_bulk_ops.sql` in full (the current `restore_assembly_backup`, `bulk_create_assemblies`, `clear_assembly_data`, `clear_all_data` functions) and Task 12's new `0009` migration (the `election_booths` shape and the 5 child tables' new `election_id` columns) before writing this file.

1. **`restore_assembly_backup`**: add `p_election_id uuid` parameter (after `p_assembly_id`, before `p_payload`, or wherever reads most naturally — match the existing param order style). The function body currently upserts into `booths` for both geography AND campaign fields in one `insert ... on conflict (assembly_id, booth_number) do update` — split this: geography fields (`booth_number`, `village_ward_area`) still upsert into `booths` on conflict `(assembly_id, booth_number)`; campaign fields (`committed_pct`, `swing_pct`, `opponent_pct`, the 6 narrative columns, `long_pending_issues`) now upsert into `election_booths` on conflict `(election_id, booth_id)` using the `booth_id` returned from the `booths` upsert. The 5 child-table upserts (party votes, castes, religions, influencers, actions) each gain `p_election_id` in their insert + their `on conflict` target now includes `election_id` (matching Task 12's new unique constraints). Bump the payload's `format_version` handling: the function currently validates `p_payload->>'format_version' = '1'` — change to `'2'`, and if the payload has `format_version = '1'`, `raise exception` with a clear message (e.g. `'format_version 1 backups are not supported after the election-cycle migration — re-export from a version 2+ backup, or contact support to migrate a v1 backup manually'`) rather than attempting to guess an election. Return-value jsonb shape stays the same field names (`booths_upserted`, etc.) — only the underlying table each count comes from changes for the campaign-scalar case (still counted once per booth, from the `election_booths` upsert, not double-counted).
2. **`bulk_create_assemblies`**: extend the payload's per-entry jsonb shape handling to also read optional `parliament_constituency_id`, `constituency_code`, `district`, `state_code` and pass them into the `insert into assemblies (...)` — all remain optional/nullable-with-default, matching Task 2's column defaults.
3. **New `clear_assembly_election_data(p_assembly_id uuid, p_election_id uuid) returns integer`**: superadmin-gated (`if not app_is_superadmin() then raise exception 'not allowed'; end if;` — copy this exact guard pattern from the existing `clear_assembly_data` in `0006`), deletes only `election_booths` rows (and, via their own `election_id` columns, the 5 child-table rows) for that `(assembly_id, election_id)` pair — NOT the `booths` rows themselves. Structure: `delete from election_booths where election_id = p_election_id and booth_id in (select id from booths where assembly_id = p_assembly_id)` returning a count, plus equivalent deletes for the 5 child tables filtered by `election_id = p_election_id and booth_id in (...)`. Log one summary activity_log row (`action_type = 'data.clear_assembly_election'`) with `booths_affected`/counts, matching `0006`'s existing logging style for `clear_assembly_data`.
4. **New `clear_election_data(p_election_id uuid) returns integer`**: same as above but system-wide (no assembly filter) — `action_type = 'data.clear_election'`.
5. Keep `clear_assembly_data(p_assembly_id)` and `clear_all_data()` from `0006` completely unchanged (they still `delete from booths ...`, which now cascades to `election_booths` too via its `on delete cascade`, correctly deleting that assembly's/system's booths AND all their campaign data across every election — this is the intended "nuclear" option, no code change needed here, just confirm via reading `0006` that the cascade chain still holds after `0009`'s schema changes and note that confirmation in your report).
6. `grant execute on function clear_assembly_election_data(uuid, uuid), clear_election_data(uuid) to authenticated;` (the function bodies enforce superadmin internally, matching the existing grant pattern for all other RPCs in `0006`).

---

## Task 14: types.ts + api.ts — election-scoped booth contracts

**Files:** `src/types.ts`, `src/data/api.ts`

Read the CURRENT `types.ts`/`api.ts` (after Tasks 3/6/8/9) before editing.

`types.ts`:
- `AssemblyBackup` gains a top-level `election: { id: string; name: string; year: number }` field; bump the type's `format_version` literal from `1` to `2`.
- `BulkAssemblyUploadRow` gains optional `parliament_constituency_id?: string`, `constituency_code?: string`, `district?: string`, `state_code?: string`.
- `Booth`, `BoothDetail`, `BoothListItem` — **do not change these**, confirm by re-reading them that they remain exactly as they are today (the whole point of this architecture is that these flat client-side shapes never change).

`api.ts` (`DataApi`) — add `electionId: string` as a new parameter to each of: `listBooths`, `getBoothDetail`, `saveBoothDetail`, `setActionStatus`, `getAssemblySummary`, `getWeakestBooths`, `getActionProgress`, `getAssemblyExport`, `restoreAssemblyBackup` (find each method's current signature first and add the param in a sensible position — typically right after any existing `assemblyId`/`boothId` param, before payload/limit params). `importBooths`/`createBooth` are UNCHANGED (geography-only, no election scoping). Add new methods: `listAssemblySummaries(electionId: string): Promise<(AssemblySummary & { assembly_id: string })[]>`, `getPcSummary(pcId: string, electionId: string): Promise<PcSummary>` (define `PcSummary { assembly_count: number; booth_count: number; avg_committed_pct: number | null; avg_swing_pct: number | null; avg_opponent_pct: number | null }` in `types.ts` first), `clearAssemblyElectionData(assemblyId: string, electionId: string): Promise<number>`, `clearElectionData(electionId: string): Promise<number>`.

Interface-only — implementations are Tasks 15/16. Note the expected `tsc -b` failure in your report (every existing call site of the changed methods will also now fail to compile until Tasks 17+ thread the new param through — that's expected and out of scope for this task; do not attempt to fix call sites here).

---

## Task 15: supabaseApi.ts — election-scoped booth implementation rewrite

**File:** `src/data/supabaseApi.ts`

This is a large, careful task. Read the CURRENT full file first, plus Task 12's `0009` migration and Task 13's `0010` migration (both already written by prior tasks — read them from disk, not from memory) for the exact table/column/RPC shapes you're now calling.

For each method changed by Task 14:
- `listBooths(assemblyId, electionId)`: the underlying query needs booth geography (`booths`) joined/left-joined with `election_booths` filtered to `electionId`, plus the existing `booth_completion` view (now election-scoped per Task 12) for progress counts — find the current implementation's exact query shape and adapt it to add the `election_booths` join and `.eq('election_id', electionId)` filter on the view query.
- `getBoothDetail(boothId, electionId)`: fetch the `booths` row (geography) AND the matching `election_booths` row for `electionId` (may not exist — a booth can have zero campaign data for a newer election; default all campaign fields to `null`/`''`/empty arrays in that case, matching how the current code already defaults missing-row cases, e.g. for `booth_actions`, which has always been created lazily). Merge both into the flat `BoothDetail` shape the UI expects (the 5 child-table fetches — party votes, castes, religions, influencers, actions — all gain `.eq('election_id', electionId)`).
- `saveBoothDetail(detail, electionId)`: **this is the one real behavior change** — currently a single `.update()` on `booths`. Now: `.from('booths').update({ booth_number, village_ward_area })` for geography, PLUS `.from('election_booths').upsert({ election_id: electionId, booth_id, committed_pct, swing_pct, opponent_pct, ...narrative fields, long_pending_issues }, { onConflict: 'election_id,booth_id' })` for campaign scalars (the row may not exist yet — upsert handles both insert and update). The 5 child-array replace-all-children writes (delete-then-reinsert, per the existing `saveBoothDetail` pattern — verify this is still the pattern used) each gain `election_id: electionId` on every inserted row and `.eq('election_id', electionId)` on the delete-existing step (so you only clear THIS election's child rows, not other elections' rows for the same booth).
- `setActionStatus(boothId, electionId, actionId, status, notes)`: upsert into `booth_actions` with `election_id` added to both the upsert values and the `on conflict` target (now `(election_id, booth_id, action_id)` per Task 12's constraint change).
- `getAssemblySummary`/`getWeakestBooths`/`getActionProgress`/`getAssemblyExport`: add `.eq('election_id', electionId)` to each underlying view/table query.
- `restoreAssemblyBackup(assemblyId, electionId, backup)`: now calls the RPC with the new `p_election_id` param from Task 13; pass `backup.election` through if the RPC needs it (check Task 13's exact signature — if the RPC derives everything server-side from `p_election_id` alone and doesn't need the client-sent `election` metadata, don't send it redundantly).
- New methods: `listAssemblySummaries(electionId)` — one query against `assembly_health_summary` filtered by `electionId`, returning all assemblies' summaries at once (avoid N+1 — this backs both the AssembliesPage health chips, Task 18, and isn't itself part of this task's UI work, just the data method). `getPcSummary(pcId, electionId)` — query the new `pc_health_summary` view filtered by both ids. `clearAssemblyElectionData`/`clearElectionData` — call the two new RPCs from Task 13.

Report exact test evidence: `npx tsc -b` will likely STILL fail after this task alone, since UI call sites haven't been updated yet (Tasks 17+) — that's expected; confirm in your report that the failures are ONLY in call sites outside `supabaseApi.ts`/`demoApi.ts` (i.e., this file itself type-checks correctly against the Task 14 interface) rather than genuine implementation bugs.

---

## Task 16: demoApi.ts — election-scoped booth implementation rewrite

**File:** `src/data/demoApi.ts`

Mirrors Task 15 exactly, for the same Task 14 interface, in the localStorage-backed implementation. Read the CURRENT full file first (it's substantial — this is the single largest file affected by this whole plan).

1. **Restructure `Store`**: `Store.booths` becomes geography-only (id, assembly_id, booth_number, village_ward_area, created_at, updated_at — drop the campaign fields from this type/array). Add `Store.electionBooths: Record<string, CampaignFields>` where the key is a composite string `` `${electionId}:${boothId}` `` and `CampaignFields` is a new local type/interface holding exactly the fields that moved out of `booths` (committed_pct, swing_pct, opponent_pct, the 6 narrative fields, long_pending_issues). Rekey the existing `Store.partyVotes`/`castes`/`religions`/`influencers`/`actions` maps (currently keyed by `boothId` alone, per prior exploration) to use the same `` `${electionId}:${boothId}` `` composite key convention — smallest-diff change, since these are already `Record<string, T[]>`-shaped maps, just changing what the key string encodes.
2. **`load()` migration step**: find the function's existing versioned-upgrade pattern (it already handles things like `long_pending_issues ??= ''`, `profiles ??= seedProfiles(...)`, `activityLog ??= []` per prior exploration — read these exact examples first). Add: if `store.elections` is undefined/missing, synthesize the SAME bootstrap election Task 12's SQL migration creates (`{ id: <new uuid>, name: 'Tamil Nadu 2026 By-Election', year: 2026, status: 'active', created_at: <now> }`), then migrate every existing flat `booths[i]`'s campaign fields into `electionBooths[`${bootstrapId}:${booth.id}`]`, strip those fields off the `booths` array entries, and rekey every existing entry in `partyVotes`/`castes`/`religions`/`influencers`/`actions` from `booth.id` to `` `${bootstrapId}:${booth.id}` ``. Do NOT bump `STORE_KEY` — this must run as an in-place upgrade of existing localStorage data, consistent with every other backfill in `load()`, so demo users don't lose their in-browser data.
3. **`toDetail`/`toListItem` (or whatever the existing merge-helper functions are named — find them)**: change signature to accept `(store, booth, electionId)`, look up `store.electionBooths[`${electionId}:${booth.id}`]` (default to empty/zero values if missing — a booth can predate a newer election having any data entered) and the composite-keyed child arrays, merging everything back into the flat `Booth`/`BoothDetail`/`BoothListItem` shape the UI expects — this must produce IDENTICAL output shape to what `supabaseApi.ts` (Task 15) produces for the same logical state, per CLAUDE.md's behavioral-consistency rule.
4. Implement every method from Task 14's interface change as plain array/map operations following the file's existing style (find `createBooth`, `saveBoothDetail`, `setActionStatus` etc. for the exact patterns — mutation style, `save(store)` calls, error-message conventions, `logActivity` call sites) — every `action_type` string must match `supabaseApi.ts`'s SQL-trigger-driven naming EXACTLY (`'election_booths.update'`, `'booth_party_votes.insert'`, etc. — this was already a hard requirement noted in the original design plan; re-verify against Task 15's/Task 12's exact naming before finalizing).
5. `Store.parliamentConstituencies`/`Store.elections` already exist from Tasks 4/9 — no new backfill needed for those, just use them.
6. Implement `listAssemblySummaries`, `getPcSummary`, `clearAssemblyElectionData`, `clearElectionData` as plain computations over the `Store` — must produce numerically-matching aggregate results to what the SQL views compute (avg/count logic) for equivalent demo-mode data, to the extent demo-mode fidelity is practical (CLAUDE.md already accepts some demo/SQL fidelity gaps for aggregate computations — match the existing judgment calls made for `assembly_health_summary`'s client-side math if you find prior art for how averages/counts are computed elsewhere in this file, and follow that exact approach rather than inventing a new one).

Same reporting note as Task 15: `tsc -b` may still fail on UI call sites outside this file; confirm this file itself satisfies the Task 14 interface correctly.

---

## Task 17: BoothPage.tsx — thread electionId

**File:** `src/pages/BoothPage.tsx`

Read the CURRENT file in full. Add `const { activeElectionId } = useActiveElection()` (from `src/election/ElectionContext.tsx`, Task 10) and pass `activeElectionId` as the new `electionId` argument to every `getBoothDetail`/`saveBoothDetail`/`setActionStatus` call site in this file (there may be several — a fetch on mount, a save mutation, per-action status-update handlers — find every call, per Task 14's new signatures). If `activeElectionId` is null (no election selected/exists yet), the page should show a clear message instead of attempting the fetch (e.g. `<p className="error">{t('தேர்தலைத் தேர்ந்தெடுக்கவும்', 'Select an election first')}</p>` guarding the rest of the page body) rather than calling the API with a null/undefined election id.

Also: the existing hardcoded label at (per prior exploration) `src/pages/BoothPage.tsx:161`, `"கட்சி வாரியாக பதிவான வாக்குகள் — 2026"` / `"2026 — Polled votes, party wise"`, becomes dynamic — interpolate the active election's `year`/`name` from `useActiveElection()` instead of the literal `2026`. Re-verify the exact current line number before editing (code has shifted from prior tasks).

No other changes to this file's 4-tab structure or field-level UI — per the plan's design principle, `BoothDetail`'s shape hasn't changed, so nothing else here should need to change.

---

## Task 18: AssembliesPage.tsx health chips + ParliamentConstituencyDashboardPage.tsx real data

**Files:** `src/pages/AssembliesPage.tsx`, `src/pages/ParliamentConstituencyDashboardPage.tsx`

Now that Task 15/16 provide `listAssemblySummaries`/`getPcSummary`, wire up the two places that were deliberately stubbed/deferred earlier:

1. `AssembliesPage.tsx` (already modified in Task 6 for PC display/edit — read its current state first): add inline per-row health chips (avg committed/swing/opponent %, or a compact single "health" pill — match the visual style of the existing per-booth health pills in `BoothListPage.tsx`'s `healthColor`/`healthLabel` utils from `src/utils/health.ts`, reuse those exact functions rather than inventing new color logic) sourced from ONE bulk `listAssemblySummaries(activeElectionId)` call (via `useActiveElection()` from Task 10), not N+1 per-row queries.
2. `ParliamentConstituencyDashboardPage.tsx` (created in Task 5 with a placeholder): replace the "coming soon" placeholder with a real `getPcSummary(pcId, activeElectionId)` call, rendering the same style of stat tiles `DashboardPage.tsx` currently uses (assembly count, booth count, avg committed/swing/opponent — read `DashboardPage.tsx`'s tile JSX for the exact `dash-tiles`/`tile` CSS-class pattern to reuse verbatim).

Both pages should handle `activeElectionId === null` gracefully (no crash, a clear "select an election" message), same as Task 17's guard.

---

## Task 19: Booths-as-tab restructure

**Files:** new `src/pages/assembly/BoothsTab.tsx`, new `src/pages/assembly/OverviewTab.tsx`, rewritten `src/pages/BoothListPage.tsx`, deleted `src/pages/DashboardPage.tsx`, `src/App.tsx`

Read the CURRENT `src/pages/BoothListPage.tsx` and `src/pages/DashboardPage.tsx` in full (both have been touched by zero prior tasks in this plan, so they're still exactly as originally explored) plus `src/components/Tabs.tsx` and one existing consumer (`src/pages/BoothPage.tsx`'s 4-tab usage, or `src/pages/SuperadminToolsPage.tsx`'s 5-tab usage) for the exact `<Tabs tabs={...} active={...} onChange={...}>` pattern.

1. Extract `BoothListPage.tsx`'s current body (search box, CSV import/export, forms-generation panel, add-booth form, the booth table itself) verbatim into `src/pages/assembly/BoothsTab.tsx`, changing it from a full page (with its own `useParams` route read) to a component taking `{ assemblyId, electionId }` props. All the `listBooths`/`createBooth`/`importBooths`/`getAssemblyExport` calls inside it now need the `electionId` prop threaded in (per Task 14's signatures) — `importBooths`/`createBooth` do NOT take an election id (geography-only, confirmed in Task 14), only the campaign-data-touching calls (`getAssemblyExport` for form generation) do.
2. Extract `DashboardPage.tsx`'s current body (4 stat tiles, weakest-booths table, action-progress table with team filter chips) verbatim into `src/pages/assembly/OverviewTab.tsx`, same prop-based restructuring (`{ assemblyId, electionId }`), plus NEW header content showing the assembly's district/constituency-code/state and its parent PC's name (linking to `/parliament-constituencies/:pcId` if set) — pull this from the existing `listAssemblies()` query already used elsewhere, find the specific assembly by id.
3. New `src/pages/BoothListPage.tsx` (thin wrapper, keeps route `/assembly/:assemblyId`): reads `assemblyId` from `useParams()`, `activeElectionId` from `useActiveElection()` (Task 10), renders `<Tabs tabs={[{key:'overview',...},{key:'booths',...}]} active={tab} onChange={setTab}>` then conditionally renders `<OverviewTab .../>` or `<BoothsTab .../>`. Sync `tab` state to a `?tab=` URL search param (use `useSearchParams()` from `react-router-dom`, defaulting to `'overview'` if absent) so the tab choice is bookmarkable/shareable, not just local `useState`.
4. Delete `src/pages/DashboardPage.tsx` entirely (its content now lives in `OverviewTab.tsx`).
5. `App.tsx`: remove the `DashboardPage` lazy import and its route registration; add a thin redirect at the old path: `<Route path="/assembly/:assemblyId/dashboard" element={<Navigate to="../?tab=overview" replace />} />` (or equivalent relative-navigate — verify the exact relative-path syntax works correctly with react-router's version in this project; if uncertain, use an explicit absolute redirect component instead that reads `assemblyId` from params and constructs `/assembly/${assemblyId}?tab=overview`). This redirect is INTENTIONALLY temporary per the plan (kept for one release) — leave a one-line comment noting that.
6. Any other place in the codebase linking to `/assembly/:id/dashboard` directly (e.g. `AssembliesPage.tsx`'s "Dashboard" button per prior exploration) should be updated to link to `/assembly/:id?tab=overview` directly instead of relying on the redirect — search for all `/dashboard` link occurrences and update them (the redirect is a safety net for external/bookmarked links, not the primary path).

---

## Task 20: De-branding sweep

**Files:** `src/components/PrintForm.tsx`, `src/utils/generateForms.ts`, `src/utils/exportCsv.ts`, `CLAUDE.md`, `README.md`, `booth-form.html`

(`src/App.tsx`'s subtitle was already made dynamic in Task 10; `src/pages/BoothPage.tsx`'s label was already made dynamic in Task 17 — do not re-touch those files for this task, just verify via a final grep that no "2026"/"by-election" strings remain in them.)

1. `src/components/PrintForm.tsx` (lines 92, 173 per prior exploration — re-verify current line numbers): add an `electionName: string` prop to whatever component/function renders the party-votes heading and the print title, interpolating it in place of the literal `"2026"`. Find every caller of this component/these functions and thread the prop through from `useActiveElection()`.
2. `src/utils/generateForms.ts` (lines 121, 201 per prior exploration): `generateTeamForms(...)` gains an `electionName` parameter, threaded into the party-votes field label and the doc title. Update its call site(s) (in the now-relocated `BoothsTab.tsx` from Task 19) to pass `activeElection?.name` (or a sensible fallback string if null).
3. `src/utils/exportCsv.ts` (line 37): `exportAssemblyCsv(...)` gains an `electionName` parameter, used in the CSV column header. Update its call site similarly.
4. `CLAUDE.md` line 7 and `README.md` line 3: reword the project description to be election-cycle-generic (e.g. "booth-level election campaign management system, supporting multiple election cycles" rather than naming 2026/by-elections specifically) — keep these edits minimal and factual, don't rewrite the whole document, just the specific hardcoded-year sentence(s).
5. `booth-form.html` (lines 126, 143 per prior exploration): genericize the "By-Election — Booth Level Detail Form (2026)" heading and the "2026 (Polled votes, party wise)" label to remove the hardcoded year, per the user's explicit decision to genericize this file too (not leave it frozen).

Final check for this task: `grep -rni "2026\|by-election\|by election" src/ booth-form.html CLAUDE.md README.md` (excluding `docs/superpowers/` which contains dated planning-doc filenames, not app branding — do not touch those) should return no more hits from live app code/copy.

---

## Task 21: Superadmin tabs — election-aware Backup/Restore, Upload, Clear Data

**Files:** `src/pages/superadmin/BackupRestoreTab.tsx`, `src/pages/superadmin/ClearDataTab.tsx`, `src/pages/superadmin/UploadAssembliesTab.tsx`

Read all three files' current state in full first (none have been touched by prior tasks).

1. `BackupRestoreTab.tsx`: add an election `<select>` (from `listElections()`, defaulting to — but not silently trusting — the global `useActiveElection()` value; let the superadmin explicitly confirm/change it before backup/restore, since this is a data-defining operation distinct from casual browsing). Thread the selected election id into `getAssemblyExport`/`restoreAssemblyBackup` calls (per Task 14/15/16's new signatures). The backup-download filename/JSON payload should include the election name/year (the `AssemblyBackup.election` field from Task 14) so downloaded files are self-describing.
2. `ClearDataTab.tsx`: currently (per the existing implementation from a prior feature in this codebase) has two `DangerConfirm`-gated sections — read it first. Restructure into the resolved design: an election `<select>` at the top, then TWO EQUALLY-WEIGHTED sections (per the user's explicit resolved decision — neither is primary/hidden): (a) "Clear this election's data" — calls `clearAssemblyElectionData`/`clearElectionData` (scoped to the selected assembly-or-all + selected election, keeps booths), (b) "Delete booths entirely (all elections)" — calls the existing `clearAssemblyData`/`clearAllData` (unchanged RPCs from `0006`, now understood to cascade across every election's data too — update this section's warning copy to say so explicitly). Both sections keep the existing `DangerConfirm` typed-confirmation pattern (find that component and reuse it, don't reinvent).
3. `UploadAssembliesTab.tsx`: update the hint/help text describing the expected JSON shape to mention the new optional `parliament_constituency_id`/`constituency_code`/`district`/`state_code` fields per assembly entry (Task 13's `bulk_create_assemblies` extension) — text-only change, no logic change needed unless the current implementation does client-side shape validation that would need updating too (check).

---

## Final integration pass (not a subagent task — controller does this directly after Task 21's review passes)

- Full repo `npx tsc -b && npm run lint && npm run build` clean.
- Manual demo-mode walkthrough per the design plan's Verification section (`VITE_DEMO=1 npm run dev`): nav back-links, create a PC and assign it, create a second election and switch the picker, enter different campaign data for the same booth under two elections and confirm isolation, confirm Overview/Booths tabs and the dashboard-route redirect, confirm no remaining "2026" strings.
- Dispatch the final whole-branch code reviewer (most capable model) per subagent-driven-development's process, covering the full branch diff.
