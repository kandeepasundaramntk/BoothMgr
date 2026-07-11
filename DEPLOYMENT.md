# Deploying BoothMgr

BoothMgr is a static Vite SPA (Vercel) talking to a Supabase backend (Postgres + Auth + RLS).
Deployment is two independent pieces: **stand up Supabase**, then **deploy the frontend to Vercel**
pointed at it. Do them in this order — the app is useless without a configured backend.

This app stores sensitive political data (caste/religion breakdowns, influencer contacts,
beneficiary info). Treat the production Supabase project and the Vercel env vars as sensitive
infrastructure — see the [Security checklist](#security-checklist-before-you-invite-real-users)
before inviting real users.

## 1. Supabase project

1. **Create a project** at [supabase.com](https://supabase.com) (pick a region close to your
   users — likely `ap-south-1` for Tamil Nadu).
2. **Apply migrations in order**, via the SQL Editor (paste each file's contents and run) or the
   Supabase CLI (`supabase link` then `supabase db push`):
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_seed_actions.sql`
   - `supabase/migrations/0003_long_pending_issues.sql`
   - `supabase/migrations/0004_profiles_and_scoped_rls.sql`
   - `supabase/migrations/0005_activity_log.sql`
   - `supabase/migrations/0006_superadmin_bulk_ops.sql`

   Run them in this exact order — later migrations assume earlier ones already exist. After
   applying, spot-check in **Table Editor** that RLS is **enabled** on every table (`booths`,
   `booth_actions`, `profiles`, `activity_log`, etc.) — it should be, since the migrations turn it
   on, but verify before going live.

   **Before applying `0006` to a database with real data**: it includes a dedup cleanup step
   (deletes duplicate `booth_party_votes`/`booth_caste_pct`/`booth_religion_pct`/`booth_influencers`
   rows, keeping the lowest `id`) required to install new unique constraints. Run the `select`
   count queries at the top of that file against your real data first to see how many rows would
   be affected — do not apply blind.
3. **Disable "Confirm email"**: Authentication → Sign In / Providers → Email → turn off "Confirm
   email". Registration is public (`/signup`); the in-app approval workflow (admin/assembly POC
   approves new signups) is the actual access gate, not email confirmation. New signups land in a
   `pending` state and see no data until approved.
4. **Grab your API credentials**: Project Settings → API →
   - `Project URL` → becomes `VITE_SUPABASE_URL`
   - `anon` `public` key → becomes `VITE_SUPABASE_ANON_KEY`

   Do **not** use the `service_role` key anywhere in this app — it bypasses RLS entirely and must
   never reach client code or Vercel's client-side env vars.
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

## 2. Vercel deployment

1. **Import the repo** in the Vercel dashboard: New Project → import
   `kandeepasundaramntk/BoothMgr` from GitHub.
2. **Framework preset**: Vercel should auto-detect Vite. If not, set manually:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
3. **Environment variables** (Project Settings → Environment Variables), for the
   `Production` (and `Preview`, if you want preview deployments to hit the same backend)
   environments:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |

   Leave `VITE_DEMO` unset — with these two vars present, production builds use the real
   Supabase backend automatically (`hasSupabaseConfig()` / `isDemoMode` in `src/data/api.ts`).
   If you ever deploy a preview without these vars, the app shows a "not configured" error
   rather than silently falling back to demo data — that's intentional, leave it as-is.
4. **SPA routing**: this is a client-side-routed app (`react-router-dom`), so unknown paths must
   fall through to `index.html`. Vercel's Vite/SPA preset does this automatically for a static
   Vite build; if you see 404s on deep links (e.g. refreshing `/assemblies/123`), add a
   `vercel.json` at the repo root:

   ```json
   {
     "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   }
   ```
5. **Deploy.** Vercel builds with `npm run build` (`tsc -b && vite build`) — a TypeScript error
   fails the build, so run `npm run build` locally first if you're unsure.
6. **Supabase Auth redirect URLs**: Authentication → URL Configuration → add your Vercel
   production domain (and any preview-deployment domain pattern you use) to the allowed redirect
   URLs, so auth flows don't get rejected.
7. **Custom domain** (optional): Project Settings → Domains → add your domain, then update DNS
   per Vercel's instructions.

After deploy, do a smoke test: sign up a throwaway account, confirm it lands on the pending
screen, approve it as the admin, and confirm booth data loads and saves correctly.

## Security checklist before you invite real users

- [ ] `service_role` key is not set as a Vercel env var and does not appear anywhere in `src/`.
- [ ] RLS is enabled on every table in the Supabase Table Editor.
- [ ] "Confirm email" is off, but you understand the approval workflow is the real gate — review
      names/emails carefully on the Approvals page before approving, since self-registration
      means anyone can request access to any assembly.
- [ ] No real voter/CSV data has been committed to the repo (`.gitignore` already excludes
      `.env*`, `*.csv`, `/data/`, `exports/` — keep it that way).
- [ ] `.env.local` was never committed (`git log --all --full-history -- .env.local` should be
      empty).
- [ ] Vercel preview deployments either point at a separate non-production Supabase project, or
      you're comfortable with preview URLs (often unlisted but not access-controlled) touching
      real data.
