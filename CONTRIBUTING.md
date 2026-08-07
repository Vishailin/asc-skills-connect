# Contributing to ASC Skills Connect

Thanks for taking a look. This is a working platform for Africa Skills
Connect (Pty) Ltd, not a toy project — the guidance below reflects how it
was actually built and tested, not aspirational process.

## Getting set up

Requires PostgreSQL (17+) and Node.js (18+) on `PATH`.

```bash
# 1. Database — rebuilds from scratch and applies every migration + seed
bash verify.sh

# 2. API + background worker (separate terminals)
cd employer-api
npm install
cp .env.example .env    # optional — zero-config local defaults work out of the box
node server.js           # -> http://localhost:4000
node worker.js            # background matching job

# 3. Dashboards, in a browser (dev-only preview, not part of the deployable app)
cd frontend
npm install
npm run dev   # -> http://localhost:5173
```

Demo accounts (password `Passw0rd!`) are listed in the top-level
[README.md](README.md).

## Project layout

See the "Layout" section of [README.md](README.md) for the full tree.
The short version: `learner_registration_database/` holds migrations and
seeds (applied in lexical order — new files must sort after existing
ones), `employer-api/` is the one Express app serving all five roles, and
the `asc_*_live.jsx` files at the repo root are the five dashboards —
plain React files with no build step of their own, imported by
`frontend/`'s dev-only Vite scaffold purely so they can be viewed in a
browser.

## Before you open a PR

This codebase was built module-by-module with a consistent bar: **write
it, then actually run it against a real database and prove it works,**
not just "looks correct." Keep that bar:

- **Test against a real Postgres instance**, not mocks. `bash verify.sh`
  gives you a clean one in seconds.
- **Hit new endpoints with curl** (or an equivalent) and check the actual
  response — status codes, error bodies, and edge cases (empty results,
  cross-tenant access, spoofed IDs in the request body). Ownership checks
  matter a lot here: a poster/learner ID should always come from the JWT
  (`req.auth.profileId`), never trusted from the request body for
  non-admins.
- **If you touched a `.jsx` dashboard, load it in a browser** via
  `frontend/` and click through the actual flow, not just read the diff.
- **Document what you tested**, not just what you built. Every module's
  section in `employer-api/README.md` ends with a "Tested end-to-end:"
  paragraph naming the specific scenarios covered — new work should do
  the same.

## Code conventions worth knowing

- **Migrations and seeds are additive and ordered.** Don't edit an
  already-applied migration; add a new numbered file.
- **A recurring Postgres footgun**: don't reuse the same `$N` parameter
  both as a plain `SET` value and inside a `CASE WHEN $N = ...`
  comparison in the same query — Postgres can't infer a consistent type
  and throws "inconsistent types deduced for parameter." Compute the
  value in JS first, or use `COALESCE($N, column)` instead.
- **Escape free-text fields going into CSV exports** (embedded commas and
  quotes both need handling) — controlled-vocabulary fields don't need
  this, but anything user-typed does.
- **RBAC pattern**: `authenticate` (checks `users.status` per-request, so
  a suspension takes effect immediately, not at token expiry) +
  `requireRole(role)` + explicit ownership checks. Follow this pattern
  for new routes rather than inventing a new one.
- **No new abstractions for a single use.** This project favors a bit of
  repetition over a premature shared helper — see the "Doing tasks"
  philosophy in the root project instructions if you're unsure.

## Scope boundary: billing

Billing is deliberately out of scope for now — the schema reserves
`subscription_tier` fields for it, but it isn't being built until it's
explicitly revisited with the project owner. Please don't add billing
functionality in a PR without checking first.

## Reporting issues

Open a GitHub issue with what you expected, what happened, and (for a
backend bug) the exact request that triggered it — this project has a
track record of catching real bugs this way (see the "Errors and fixes"
style write-ups throughout `employer-api/README.md`), so a precise repro
is genuinely useful.
