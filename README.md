# ASC Skills Connect

[![CI](https://github.com/Vishailin/asc-skills-connect/actions/workflows/ci.yml/badge.svg)](https://github.com/Vishailin/asc-skills-connect/actions/workflows/ci.yml)
[![GitHub repo](https://img.shields.io/badge/GitHub-Vishailin%2Fasc--skills--connect-181717?logo=github)](https://github.com/Vishailin/asc-skills-connect)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

A workforce development platform for Africa Skills Connect (Pty) Ltd — one
journey for every learner: **Register → Verify → Match → Train → Place →
Track Employment**. Five roles (Learner, Employer, TSP, Funder, Admin),
each with their own dashboard and permission set.

Full requirements: [`ASC_Skills_Connect_Technical_Spec.docx`](ASC_Skills_Connect_Technical_Spec.docx).
Build history and the design decisions behind this repo:
[`ASC_PROJECT_BRIEF.md`](ASC_PROJECT_BRIEF.md).

Every module below was built and then **re-verified live against a real
PostgreSQL + Node stack** — schema load, seed load, and the actual API
endpoints hit with curl (not just written and assumed correct). Several
real bugs were caught this way and are documented in the relevant
module's README rather than swept under the rug.

## Quick start

The whole thing, one command (Postgres, migrations/seeds, the web app —
API + frontend, served together — and the background worker, all
containerized):

```bash
docker compose up --build
open http://localhost:4000   # the actual app
```

Or without Docker:

```bash
# 1. Database — rebuilds from scratch and applies every migration + seed
bash verify.sh

# 2. Frontend — build once (skip this to run API-only)
cd frontend
npm install
VITE_API_BASE="" npm run build

# 3. API + background worker (separate terminals)
cd ../employer-api
npm install
cp .env.example .env    # optional — zero-config local defaults work out of the box
node server.js           # terminal 1 -> http://localhost:4000 (serves the app + API)
node worker.js            # terminal 2 -> background matching job
```

Requires PostgreSQL (17+) and Node.js (18+) on `PATH`. See
[`DEPLOYMENT.md`](DEPLOYMENT.md) for what it takes to point any of this
at a real host.

For active frontend development (hot reload, no rebuild step), run the
Vite dev server directly instead of building — it talks to the API
running separately on `:4000`:

```bash
cd frontend
npm install
npm run dev   # -> http://localhost:5173
```

The five dashboards (`asc_*_live.jsx`) are routed by role —
`/learner`, `/employer`, `/tsp`, `/funder`, `/admin` — with `/` as a
role picker. All five were confirmed live in a browser: a full learner
registers through the actual 7-step wizard and a returning learner signs
in to browse and apply to opportunities directly; real login per role on
the other four; real API-backed dashboards; and a full write path
exercised end to end (employer shortlist → confirm placement; TSP
pipeline advance; admin verification pre-check) — not just rendered,
actually clicked through.

### Demo credentials

Every seeded account, password `Passw0rd!`:

| Role | Email |
|---|---|
| Employer | `hr@gautengfreight.co.za` / `hr@wctech.co.za` |
| TSP | `admin@ubuntuskills.co.za` |
| Funder | `admin@mictseta.org.za` |
| Admin | `admin@ascskillsconnect.co.za` |
| Learner | `nomvula.k@example.co.za` (+ 4 more from seed data — or register a new one via the wizard) |

## Layout

```
learner_registration_database/
  migrations/     001_schema.sql ... 010_placement_notes.sql
  seeds/          001_learners.sql ... 005_auth.sql
  README.md       schema documentation, design decisions

employer-api/
  server.js       Express API — all 5 roles' routes, auth/RBAC, admin console, registration
  worker.js        background matching job (Postgres LISTEN/NOTIFY)
  storage.js        local-disk file storage (S3-shaped interface)
  notifier.js         notification delivery (console-log stub provider)
  verifier.js           verification pre-check (real SA ID checksum + SAQA stub)
  .env.example     every configurable value, with local-dev defaults
  README.md        full endpoint reference, one section per module, all with test notes

asc_learner_registration_live.jsx   7-step registration wizard -> Digital Skills Passport
asc_employer_dashboard_live.jsx      Candidate search, shortlist, placements
asc_tsp_dashboard_live.jsx            Learner pipeline (matched→shortlisted→enrolled→completed)
asc_funder_dashboard_live.jsx          Aggregate stats + CSV export (no candidate identities)
asc_admin_dashboard_live.jsx            Platform reporting, moderation, verification queue

frontend/
  src/main.jsx    react-router routes (/learner, /employer, /tsp, /funder, /admin) over the five dashboards above
  vite.config.js  builds them from the repo root into frontend/dist, served by server.js in production

Dockerfile        multi-stage: builds frontend/dist, then the API runtime that serves it
docker-compose.yml   full local/CI stack — Postgres, migrate step, web app, worker
verify.sh        rebuilds the DB from a clean drop and applies everything, in order
DEPLOYMENT.md    what it takes to point this at a real host
```

## What's built (all live-tested — see `employer-api/README.md` for the details)

- **Learner registration** — the full 7-step wizard, wired to a real transactional API endpoint, ending in a real Digital Skills Passport
- **Learner application/browsing UI** — a returning learner signs in to a full portal, browses every open opportunity scored against their own profile, and applies/withdraws directly (idempotent, ownership-scoped) — not just passive background matching
- **Opportunity creation** — employers/TSPs/funders can post a real opportunity through the API (and each dashboard's UI), not just via seeded SQL; the poster's id always comes from the auth token, never the request body
- **Employer Search & Dashboard** — eligibility scoring, shortlist, placement confirmation
- **TSP Dashboard** — programme pipeline (matched → shortlisted → enrolled → completed/withdrawn)
- **Funder Portal** — aggregate stats, CSV export, and (as of 2026-08-06) a full-identity candidate view — read-only, no shortlist/placement actions (see its README section for the masking-policy decision)
- **Auth (JWT + RBAC)** — all 5 roles, ownership-scoped, admin bypass, rate-limited login
- **Background matching job** — Postgres triggers + a worker process auto-score on opportunity/profile changes
- **Notification delivery** — pluggable interface, console-log stub provider (not real email/SMS)
- **Admin console** — platform-wide reporting, opportunity moderation, verification review queue, user suspend/reactivate (immediate — enforced per-request, not deferred to token expiry)
- **Placement tracking** — the `placements` table, wired up end to end
- **Document storage** — real upload/download, local disk (S3-shaped interface for later)
- **Verification vendor seam** — real SA ID checksum pre-check + an honest SAQA stub, no fake integration

## Known gaps

In roughly the order they'd block a real launch:

1. **Billing** — deliberately out of scope for now. The schema already has
   `subscription_tier` fields reserved for it (per the original brief), so
   no rework needed later — just not being built until you want to revisit it.
2. **Real vendor integrations** — DHA ID verification, SAQA VeriSearch, and
   real notification delivery (email/SMS/WhatsApp) all need contracts/
   accounts this project doesn't have. The pluggable seams are built
   (`verifier.js`, `notifier.js`) so wiring in a real provider later is a
   contained change, not a rewrite.
3. **No reconciliation sweep** for missed `NOTIFY` events if the worker was
   down when something changed (see `employer-api/README.md`'s matching-job
   section).
4. **No way to edit or delete an opportunity's requirements** after
   creation — `PATCH /api/opportunities/:id` only covers `status` and
   `match_threshold`, not the eligibility criteria themselves.
5. **No way for a learner to edit their visibility settings** after
   registering — they can browse/apply/withdraw to opportunities now, but
   changing who can see their profile still requires the admin console.

## Design decisions worth knowing before touching this code

The full list is in `ASC_PROJECT_BRIEF.md` and each module's README, but
the two most load-bearing:

- **Verification is write-once, admin/vendor-owned.** No learner-facing
  path ever marks their own ID/qualification "verified" — only the admin
  console's review endpoint (and its automated pre-check, which can only
  auto-*reject*, never auto-verify).
- **Opportunities have one poster, via nullable FKs + a check constraint**
  (`num_nonnulls(employer_id, tsp_id, funder_id) = 1`), not a polymorphic
  pattern. All three poster types share one `applications` table and one
  status enum.
- **Candidate identity is unmasked everywhere (employer, TSP, funder) but
  gated by per-role visibility flags** (`visible_to_employers`/`_tsps`/
  `_funders`) and by who's allowed to *act* on what's seen. Resolved
  2026-08-06 — see `employer-api/README.md`'s Funder Portal section for
  the full reasoning.
