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
- `supabase/migrations/` — schema (`0001`), action seed (`0002`), long-pending-issues column (`0003`), profiles/roles/scoped RLS (`0004`). Every table has deny-by-default RLS scoped by role and assembly: `admin` sees all, `assembly_poc`/`member` only their own assembly (security-definer helpers `app_role()`/`can_access_assembly()`/`can_access_booth()`). Profile writes go through RPCs (`approve_user`, `reject_user`, `set_user_role`) — no direct update policies. Dashboard aggregates come from the SQL views `booth_completion`, `assembly_health_summary`, `action_progress` (mirrored by client-side math in `demoApi.ts` — keep them consistent, including its role-scoping simulation).
- Users self-register (`/signup`, assembly dropdown via the anon `signup_assemblies()` RPC — the one deliberate anon exception, names only) and stay `pending` (no data access; `PendingApprovalPage`) until an admin or their assembly's POC approves them on `/approvals`. `AuthContext` exposes `profile` (role/status/assembly) next to `email`; the `Shell` guard in `App.tsx` enforces the pending screen; non-admins skip the assemblies list and land on their own assembly. First admin is bootstrapped by SQL (see README).
- `src/pages/` — Login, Signup, PendingApproval, Approvals, Assemblies (admin only; others redirect), BoothList (CSV import/export), Booth (detail form as 4 topic tabs + 21-action checklist; `src/components/Tabs.tsx`), BoothPrint (paper-form layout), Dashboard.
- Booth Health Score (action 10) lives as `committed_pct`/`swing_pct`/`opponent_pct` columns on `booths`, not in `booth_actions`. `booth_actions` rows are created lazily — a missing row means `not_started`.
- Visual identity follows the original paper form (`booth-form.html`): `#b71c1c` accent, Tamil-capable font stack. Global styles in `src/styles.css`.

## Requirements Documents

- `By election booth level detailed requirement.xlsx` — original requirements: "Booth level details" sheet (the data schema) and "Booth level actions" sheet (the 21 actions, in Tamil). When reading it with Python, write extracted Tamil text to a UTF-8 file rather than printing to console (console codepages may not handle Tamil).
- `booth-form.html` — the printable paper form v1 was built from; `BoothPrintPage` reuses its layout.

## Data Sensitivity

The system holds voter-level political data: caste/religion percentages, influencer contact details, beneficiary information. Rules:

- Never commit real data files, CSV exports, or `.env.local` (all gitignored).
- Never add anonymous/public RLS policies or disable RLS.
- Seed/demo data must be clearly fictional (`மாதிரி` / "demo" naming).
- Flag privacy implications when designing storage or export features.
