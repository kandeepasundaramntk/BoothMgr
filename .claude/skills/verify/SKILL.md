---
name: verify
description: How to verify BoothMgr changes end-to-end by driving the app in demo mode
---

# Verifying BoothMgr

There are no unit tests; verification = driving the running app in demo mode.

## Launch

```bash
npm install                 # once
VITE_DEMO=1 npm run dev     # http://localhost:5173, background it
```

Demo mode needs no Supabase project: any email signs in (password optional),
data lives in localStorage under `boothmgr-demo-v1`. First load seeds one
fictional assembly ("மாதிரி தொகுதி (Demo Assembly)") with 3 booths — booth 1
has actions 1,2 done / 3 in-progress / 10 done and health 55/25/20; booth 2
has 1 done / 1 in-progress and 30/40/30; booth 3 is empty. Clear that
localStorage key to re-seed.

Seed users (fictional): `demo@example.com` = approved admin (also what any
*unknown* email resolves to, so "any email signs in" still acts as admin);
`poc@demo.example` = approved assembly POC of the demo assembly;
`pending1@demo.example` / `pending2@demo.example` = pending members, so the
Approvals page is testable out of the box. The demo session email lives in
sessionStorage `boothmgr-demo-session`.

## Flows worth driving

- Login → assemblies list → booth list (progress counts + health pills must
  match the seed math above). Non-admin users skip the assemblies list and
  land on their own assembly's booth list.
- Booth detail is 4 tabs (Basic / Votes & social / Issues & notes / Actions):
  flip an action's status on the Actions tab (saves instantly), edit a
  free-text field on Issues & notes → Save button → F5 → both must survive
  the reload. Save works across tabs (one Save saves all).
- Registration loop: sign out → `/signup` as a new user → "waiting for
  approval" screen (no data reachable) → sign out, sign in as
  `demo@example.com` → Approvals → approve → sign in as the new user → lands
  on their assembly. `poc@demo.example` sees only the demo assembly and its
  pending members; a plain member gets no Approvals header link.
- Dashboard `/assembly/<id>/dashboard`: tiles are SQL-style averages
  (nulls ignored — 3-booth seed gives 42.5/32.5/25.0); weakest-booths list
  excludes booths with no health score.
- Print view `/booth/<id>/print`.
- Error probe: add a booth with an existing number → inline bilingual error.

## Gotchas

- Drive with the Claude-in-Chrome tools (no Playwright installed). Screenshots
  inside browser_batch sometimes time out ~30s while Vite is busy; retake the
  screenshot standalone after a short wait instead of retrying the batch.
- CSV import opens a native file dialog and CSV export triggers a download —
  both need user-side interaction; don't drive them headlessly.
- Console text output can't print Tamil on this Windows codepage; write any
  extracted text to a UTF-8 file.
