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
3. **Disable public signups** (Authentication → Providers → Email → turn off
   signups) and create coordinator accounts by hand (Authentication → Users).
4. **Configure the app**: `cp .env.example .env.local` and fill in the project
   URL and anon key.
5. `npm install && npm run dev`

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

- Every table has deny-by-default RLS; only authenticated users can read/write.
  Never add anonymous policies.
- Never commit real voter data, CSV exports, or `.env.local` (gitignored).
- CSV exports land on the coordinator's machine — handle and delete them
  responsibly.
