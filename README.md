# BoothMgr — பூத் மேலாண்மை

Booth-level election campaign management for the 2026 Tamil Nadu by-elections.
Digitizes the booth detail form (see `booth-form.html`), tracks the 21
booth-level campaign actions per booth, and provides assembly dashboards.

## Stack

- React 18 + TypeScript + Vite (SPA)
- Supabase: Postgres + Auth + Row Level Security (`supabase/migrations/`)

## Setup

1. **Create a Supabase project** at supabase.com.
2. **Apply migrations**: run the SQL files in `supabase/migrations/` in order
   (SQL Editor, or `supabase db push` with the Supabase CLI).
3. **Disable "Confirm email"** (Authentication → Sign In / Providers → Email).
   Registration is public, but the in-app approval workflow is the gate: new
   signups are `pending` and see no data until approved.
4. **Configure the app**: `cp .env.example .env.local` and fill in the project
   URL and anon key.
5. `npm install && npm run dev`
6. **Bootstrap the first admin**: sign up through the app, then run in the
   Supabase SQL editor:

   ```sql
   update profiles set role = 'admin', status = 'approved', assembly_id = null,
     approved_at = now()
   where email = 'you@example.org';
   ```

## Users, roles & approval

Anyone can sign up (`/signup`) with name, phone, email, password and their
assembly. They stay on a "waiting for approval" screen until approved from the
Approvals page by:

- **admin** — sees all assemblies, approves anyone, promotes members to
  assembly POC (and back) — never demote the last admin;
- **assembly POC** (தொகுதி பொறுப்பாளர்) — scoped to one assembly; approves or
  rejects that assembly's members;
- **member** — scoped to one assembly; edits its booth forms.

Row Level Security enforces the scoping server-side: members/POCs can only
read and write rows of their own assembly; profile writes go through
security-definer RPCs (`approve_user`, `reject_user`, `set_user_role`) so a
POC cannot escalate roles. See `supabase/migrations/0004_profiles_and_scoped_rls.sql`.

### Demo mode (no Supabase)

Plain `npm run dev` with no Supabase keys configured automatically runs in
demo mode (`VITE_DEMO=1 npm run dev` forces it even when keys exist). Runs
entirely in the browser with fictional seed data (localStorage). Any
email/password signs in. For evaluation only — production builds without
keys show a not-configured error instead.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | typecheck + production build |
| `npm run lint` | ESLint |
| `npm run preview` | serve the production build |

## Data sensitivity

This system stores caste/religion breakdowns, influencer contact details, and
beneficiary information — sensitive political data.

- Every table has deny-by-default RLS, scoped per assembly and role (see
  above). Never add anonymous policies — the single deliberate exception is
  the `signup_assemblies()` RPC, which exposes assembly id + name only
  (public constituency names) so the signup form can offer the dropdown.
- Never commit real voter data, CSV exports, or `.env.local` (gitignored).
- CSV exports land on the coordinator's machine — handle and delete them
  responsibly.
