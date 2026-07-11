# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

"BoothMgr" is a booth-level election campaign management system for the 2026 Tamil Nadu by-elections (NTK 2.0). v1 digitizes the paper booth detail form, tracks the status of 21 booth-level campaign actions per booth, and provides assembly dashboards. The UI is bilingual — Tamil-primary by default with a header toggle to English-primary; labels are ta/en pairs at the call site via `src/i18n.tsx` (`<L ta en/>` / `useT()`), no i18n framework. Print views and generated .docx forms stay Tamil-primary.

## Stack & Commands

React 18 + TypeScript + Vite SPA backed by Supabase (Postgres + Auth + RLS).

- `npm run dev` — dev server; falls back to browser-only demo mode (fictional data) when no Supabase keys are configured (`VITE_DEMO=1` forces demo)
- `npm run build` — `tsc -b` typecheck + Vite production build
- `npm run lint` — ESLint (flat config)

There are no unit tests yet; verification is done by driving the app in demo mode (Playwright against `VITE_DEMO=1 npm run dev`).

## Architecture

- `src/data/api.ts` — `DataApi` interface; `getApi()` returns the Supabase implementation (`supabaseApi.ts`) or, when `VITE_DEMO=1`, a localStorage implementation (`demoApi.ts`). All pages go through this interface — never call Supabase directly from a page.
- `src/data/actionsCatalog.ts` — the 21 campaign actions as a TS constant. It mirrors `supabase/migrations/0002_seed_actions.sql`; **if one changes, change both**. (The `team` field is app-only metadata, not in the DB.)
- `src/data/teams.ts` — Assembly POC / IT Wing / Both categorization of booth-form fields and actions (app-only; from the requirements sheet shading and the user's field assignments). UI badges/filter chips live in `src/components/TeamBadge.tsx`.
- `supabase/migrations/` — schema (`0001`), action seed (`0002`), long-pending-issues column (`0003`), profiles/roles/scoped RLS (`0004`), append-only activity log + generic audit trigger (`0005`), superadmin bulk-op RPCs: backup restore, bulk assembly upload, clear data, view-as logging (`0006`). Every table has deny-by-default RLS scoped by role and assembly: `superadmin`/`admin` see all, `assembly_poc`/`member` only their own assembly (security-definer helpers `app_role()`/`app_is_admin()`/`app_is_superadmin()`/`can_access_assembly()`/`can_access_booth()`). `superadmin` is a strict superset of `admin` — it additionally owns the assembly list (assemblies CRUD), the admin/superadmin roster, and the Superadmin Tools page (`/admin`: users list, activity log, backup/restore, bulk assembly upload, clear data, view-as), none of which `admin` can touch. Profile writes go through RPCs (`approve_user`, `reject_user`, `set_user_role`) — no direct update policies. Dashboard aggregates come from the SQL views `booth_completion`, `assembly_health_summary`, `action_progress` (mirrored by client-side math in `demoApi.ts` — keep them consistent, including its role-scoping simulation).
- `activity_log` (migration `0005`) is written by a generic `log_activity()` trigger on `assemblies`, `booths`, and every booth-child table plus `profiles` — nothing needs manual instrumentation to be logged, RPCs included. `booth_caste_pct`/`booth_religion_pct`/`booth_influencers` are redacted to "which columns changed" (never actual values), per CLAUDE.md's Data Sensitivity mandate. `actor_id`/`target_id`/`assembly_id` are plain `uuid`, deliberately not foreign keys, so the log survives deletion of the row it describes. Select-only RLS, superadmin-only (`app_is_superadmin()`); demoApi mirrors this manually via a `logActivity()` helper at each write call site (`src/data/demoApi.ts`) — keep the `action_type` strings identical between the two so the Activity Log UI's filter behaves the same in both modes.
- View-as (`src/auth/AuthContext.tsx`): superadmin-only, **read-only, client-side simulation** — the real session/auth token never changes (no `service_role`, no Edge Functions, per `DEPLOYMENT.md`), so it cannot verify what the target user's own RLS permissions would actually allow. `useEffectiveProfile()` (`viewAsProfile ?? profile`) drives role-gating/nav; `useViewAs()` drives the banner/exit control. `Shell()` wraps `<Outlet/>` in a disabled `<fieldset>` while viewing-as. Not persisted across reloads.
- Users self-register (`/signup`, assembly dropdown via the anon `signup_assemblies()` RPC — the one deliberate anon exception, names only) and stay `pending` (no data access; `PendingApprovalPage`) until an admin/superadmin or their assembly's POC approves them on `/approvals`. `AuthContext` exposes `profile` (role/status/assembly) next to `email`; the `Shell` guard in `App.tsx` enforces the pending screen; users who are neither admin nor superadmin skip the assemblies list and land on their own assembly. First superadmin is bootstrapped by SQL (see README).
- `src/pages/` — Login, Signup, PendingApproval, Approvals, Assemblies (admin/superadmin see the full list; only superadmin can add an assembly; others redirect), BoothList (CSV import/export), Booth (detail form as 4 topic tabs + 21-action checklist; `src/components/Tabs.tsx`), BoothPrint (paper-form layout), Dashboard, SuperadminToolsPage (`/admin`, superadmin-only, 5 tabs under `src/pages/superadmin/`: Users, Activity Log, Backup/Restore, Upload Assemblies, Clear Data — the latter gated behind `src/components/DangerConfirm.tsx`'s typed-confirmation control).
- Booth Health Score (action 10) lives as `committed_pct`/`swing_pct`/`opponent_pct` columns on `booths`, not in `booth_actions`. `booth_actions` rows are created lazily — a missing row means `not_started`.
- Visual identity follows the original paper form (`booth-form.html`): `#b71c1c` accent, Tamil-capable font stack. Global styles in `src/styles.css`.

## Requirements Documents

- `By election booth level detailed requirement.xlsx` — original requirements: "Booth level details" sheet (the data schema) and "Booth level actions" sheet (the 21 actions, in Tamil). When reading it with Python, write extracted Tamil text to a UTF-8 file rather than printing to console (console codepages may not handle Tamil).
- `booth-form.html` — the printable paper form v1 was built from; `BoothPrintPage` reuses its layout.

## Data Sensitivity

The system holds voter-level political data: caste/religion percentages, influencer contact details, beneficiary information. Rules:

- Never commit real data files, CSV exports, or `.env.local` (all gitignored). JSON backups downloaded from Superadmin Tools carry the same sensitive fields — handle them with the same care.
- Never add anonymous/public RLS policies or disable RLS.
- Seed/demo data must be clearly fictional (`மாதிரி` / "demo" naming).
- Flag privacy implications when designing storage or export features.
- The activity log (`0005`) exists specifically so "log everything" doesn't become a second unredacted copy of sensitive data — keep the redaction list (`booth_caste_pct`, `booth_religion_pct`, `booth_influencers`) in sync if new sensitive tables are added.
