# Deployment

Host-agnostic notes for whoever ends up hosting this — Web Partner, or a
platform like Render/Railway/Fly.io. Nothing here assumes a specific
provider; the goal is that these steps translate to whatever's chosen.

## What has to be deployed

Three things, run as separate processes:

1. **PostgreSQL** (17+) — schema via `learner_registration_database/migrations/*.sql`, seed data via `learner_registration_database/seeds/*.sql`, applied in lexical order.
2. **The API** (`employer-api/server.js`) — the web-facing process, port `4000` by default (overridable via `PORT`).
3. **The background worker** (`employer-api/worker.js`) — no web port; listens on Postgres `LISTEN/NOTIFY` for the auto-matching job. Same codebase/image as the API, different start command.

The five `asc_*_live.jsx` dashboards are the fourth piece and are
**not yet deployment-ready** — see "Known gap: the frontend" below
before promising a live UI, not just a live API.

## Two ways to run the API + worker

### Docker (recommended if the host supports it)

```bash
docker compose up --build
```

`docker-compose.yml` at the repo root builds `employer-api/Dockerfile`
once and runs it as both the `api` and `worker` services (same image,
different `command:`), plus a real Postgres container and a one-shot
`migrate` service that applies every migration/seed before either
starts. This exact stack is what CI's `docker-compose` job runs on every
push — if that job is green, the image is known to boot cleanly against
a fresh database. For a real deploy, point the host's Postgres at the
same migrations/seeds (see below) and run the `employer-api` image
directly, without the `postgres`/`migrate` services (those exist for
local/CI use — a real host should have managed Postgres already).

### Bare Node (if the host doesn't do containers)

```bash
cd employer-api
npm install
node server.js    # web process
node worker.js    # background process — needs to stay running, same as server.js
```

Both need the environment variables below. Applying migrations/seeds
without Docker: run `bash verify.sh` once against the target database
(edit `PSQL_BIN`/`DB_*` at the top for a non-Windows/non-local `psql`),
or replicate the loop from `.github/workflows/ci.yml`'s
`database-and-api` job — it's the Linux-native version of the same
thing.

## Required environment variables

All documented with defaults in `employer-api/.env.example`. The ones
that **must** be overridden before this is live for real users:

| Variable | Why it can't stay default |
|---|---|
| `JWT_SECRET` | Defaults to an insecure dev-only string — `server.js` prints a warning on startup for exactly this reason. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Point at the real production database, not localhost |
| `CORS_ORIGIN` | Defaults to `http://localhost:5173` (the dev scaffold) — `server.js` prints a warning on startup if unset. Set it to the real frontend's origin(s) once a domain exists, comma-separated if there's more than one (e.g. a staging + production domain) |

Everything else (`JWT_EXPIRES_IN`, `PORT`, `NOTIFICATION_PROVIDER`) can
stay at its documented default unless there's a specific reason to
change it.

## Pre-launch checklist

- [ ] `JWT_SECRET` set to a real generated value (not the `.env.example` default)
- [ ] `CORS_ORIGIN` set to the real frontend domain(s) — enforced in code (`server.js` rejects any other browser origin), defaults to the dev scaffold's origin only, with a startup warning if left unset
- [ ] Uploaded documents (`storage.js`, local disk under `employer-api/uploads/`) are on a volume that survives redeploys — an ephemeral filesystem will silently lose them
- [ ] Postgres has backups configured — nothing in this repo handles that
- [ ] `NOTIFICATION_PROVIDER` is still `console` (stub) — real learners won't get real notifications until `notifier.js` gets a real provider (see its README section)
- [ ] `verifier.js`'s SAQA check is still a stub — same caveat for qualification verification

## Known gap: the frontend

`frontend/` is explicitly a **dev-only preview scaffold** (see its
`package.json` description and the top-level README's Known Gaps) — it
imports the five `asc_*_live.jsx` files directly from the repo root via
a Vite alias workaround, has no routing, and was only ever meant to
prove the dashboards work in a browser during development.

`npx vite build` inside `frontend/` does produce a working bundle (CI's
`frontend-build` job runs it on every push as a syntax check), but it
bundles all five dashboards behind one dev-scaffold tab switcher — not
a real multi-page production app with per-role routing/auth-gating at
the URL level. Treat this as a separate task to scope before the
frontend goes live, not something this deploy setup already covers.

## What this repo does not decide for you

Which host, which region, a domain name, and TLS/certificate setup are
all provider-specific and intentionally left out of this document.
