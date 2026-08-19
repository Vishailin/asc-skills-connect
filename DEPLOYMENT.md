# Deployment

Host-agnostic notes for whoever ends up hosting this — Web Partner, or a
platform like Render/Railway/Fly.io. Nothing here assumes a specific
provider; the goal is that these steps translate to whatever's chosen.

If you're handing this to a hosting provider and just need the short
version, skip to **"What to give your host"** below.

## What has to be deployed

Three things, run as separate processes:

1. **PostgreSQL** (17+) — schema via `learner_registration_database/migrations/*.sql`, seed data via `learner_registration_database/seeds/*.sql`, applied in lexical order.
2. **The web app** (`employer-api/server.js`) — one process serves both the API *and* the built frontend (the five `asc_*_live.jsx` dashboards, routed by role at `/learner`, `/employer`, `/tsp`, `/funder`, `/admin`) from the same origin. Port `4000` by default (overridable via `PORT`).
3. **The background worker** (`employer-api/worker.js`) — no web port; listens on Postgres `LISTEN/NOTIFY` for the auto-matching job. Same image as the web app, different start command.

Frontend and API being one process is deliberate: it means no second
origin, no CORS configuration needed for the app to talk to itself, and
one thing for a host to actually run instead of two coordinated ones.

## Two ways to run it

### Docker (recommended if the host supports it)

```bash
docker compose up --build
open http://localhost:4000   # the actual app, not just the API
```

The root `Dockerfile` is a multi-stage build: stage 1 builds the
frontend (`VITE_API_BASE=""`, so it calls the API same-origin), stage 2
is the API runtime with that build copied in alongside it. The same
final image runs both the `api` and `worker` services in
`docker-compose.yml` (same image, different `command:`), plus a real
Postgres container and a one-shot `migrate` service that applies every
migration/seed before either starts. This exact stack is what CI's
`docker-compose` job builds and smoke-tests — including asserting the
real frontend HTML loads at `/` and `/learner`, not just that the API
responds — on every push. If that job is green, the image is known to
work end to end against a fresh database.

For a real deploy: build the image from the repo root
(`docker build -t asc-skills-connect .`), point it at the host's own
managed Postgres instead of the `postgres`/`migrate` services (those
exist for local/CI use only), and run it twice — once as-is for the web
process, once with `command: node worker.js` for the worker.

### Bare Node (if the host doesn't do containers)

```bash
# Build the frontend once
cd frontend
npm install
VITE_API_BASE="" npm run build   # produces frontend/dist

# Run the web app + worker (separate processes)
cd ../employer-api
npm install
node server.js    # serves the API and frontend/dist together
node worker.js    # background process — needs to stay running, same as server.js
```

`server.js` only serves the frontend if `frontend/dist` exists (checked
at startup) — skipping the build step just means it falls back to
API-only, which is also a valid way to run it if the frontend is ever
hosted separately instead.

Applying migrations/seeds without Docker: run `bash verify.sh` once
against the target database (edit `PSQL_BIN`/`DB_*` at the top for a
non-Windows/non-local `psql`), or replicate the loop from
`.github/workflows/ci.yml`'s `database-and-api` job — it's the
Linux-native version of the same thing.

## Required environment variables

All documented with defaults in `employer-api/.env.example`. The ones
that **must** be overridden before this is live for real users:

| Variable | Why it can't stay default |
|---|---|
| `JWT_SECRET` | Defaults to an insecure dev-only string — `server.js` prints a warning on startup for exactly this reason. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Point at the real production database, not localhost |
| `CORS_ORIGIN` | Only matters if the frontend is ever split onto a different origin than the API — the deployment shape above is same-origin, so this can usually just be set to the app's own domain (or left at its dev default) with no practical effect. `server.js` prints a startup warning if it's unset |

Everything else (`JWT_EXPIRES_IN`, `PORT`, `NOTIFICATION_PROVIDER`) can
stay at its documented default unless there's a specific reason to
change it.

## What to give your host

If someone else (Web Partner, or any hosting provider) is standing this
up, this is the actual list:

1. **The image or the repo** — either build access to this repo, or a
   built image of it (`docker build -t asc-skills-connect .` from the
   repo root). They need to run it as **two long-running processes**,
   not a request-response function — the web app and the worker both
   need to just keep running, not spin up per-request.
2. **A PostgreSQL 17 database** — managed by them, or one you provide
   connection details for. Migrations/seeds need to be applied once
   (see above) before the app can serve real traffic.
3. **A domain, pointed at wherever they host it, with TLS** — DNS and
   certificate setup is on them (or whoever manages the domain); this
   repo doesn't do anything TLS-specific since it expects to sit behind
   whatever terminates HTTPS.
4. **The environment variables above**, set on their infrastructure —
   in particular a real generated `JWT_SECRET` and the real `DB_*`
   values for wherever the database ends up.
5. **A persistent volume for `employer-api/uploads/`** — uploaded
   learner documents live on local disk (`storage.js`, an S3-shaped
   interface for later). An ephemeral filesystem will silently lose
   them on every redeploy.

## Pre-launch checklist

- [ ] `JWT_SECRET` set to a real generated value (not the `.env.example` default)
- [ ] Postgres is the host's real managed instance, migrations/seeds applied
- [ ] Domain + TLS in place, pointed at the deployed app
- [ ] Uploaded documents are on a volume that survives redeploys
- [ ] Postgres has backups configured — nothing in this repo handles that
- [ ] `NOTIFICATION_PROVIDER` is still `console` (stub) — real learners won't get real notifications until `notifier.js` gets a real provider (see its README section)
- [ ] `verifier.js`'s SAQA check is still a stub — same caveat for qualification verification

Both stub items above are a deliberate, separate decision — they need
real vendor accounts (SendGrid/Twilio-style for notifications, a SAQA
integration for verification) that this project doesn't have yet, not
something "going live" fixes on its own.

## What this repo does not decide for you

Which host, which region, and who owns/renews the domain are all
provider-specific and intentionally left out of this document.
