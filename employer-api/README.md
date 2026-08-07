# Employer / TSP / Funder API — ASC Skills Connect

Real Express + PostgreSQL API. Tested end-to-end against a live Postgres
instance in the build sandbox — every endpoint below was hit with curl and
returned correct, database-backed results (not mocked).

## Auth

Every route except `/api/health` and `/api/auth/login` requires a bearer
token now (`migrations/005_auth.sql` + `seeds/005_auth.sql`). See the
**Auth & RBAC** section near the bottom for the login flow, demo
credentials, and how role/ownership scoping works.

## Prerequisites

The full `learner_registration_database` migration + seed chain applied —
simplest way: `bash verify.sh` from the repo root, which does all of it
against a fresh database in one shot. See `learner_registration_database/
README.md` for the manual, file-by-file version.

## Setup

```bash
npm install
cp .env.example .env   # optional — sensible local-dev defaults work with zero setup
node server.js          # terminal 1 -> Employer API listening on http://localhost:4000
node worker.js           # terminal 2 -> background matching job (see below)
```

Connection details, JWT secret, port, and the notification provider are
all read from environment variables (`.env`, see `.env.example`) with the
same local-dev defaults this project used throughout — nothing to
configure to just run it, but everything is overridable before deploying
anywhere real.

## Endpoints (all tested)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness check |
| GET | `/api/opportunities?employer_id=...` | List an employer's opportunities, with live matched/shortlisted counts |
| GET | `/api/opportunities/:id/candidates?province=&qualification=` | The core query — scores every visible learner in `learner_search_view` against that opportunity's criteria (province/age/employment/qualification, 25 points each), returns ranked, filterable |
| POST | `/api/opportunities/:id/shortlist` `{ learner_id, score }` | Upserts an `applications` row to `shortlisted` |
| GET | `/api/employers/:id/dashboard` | Aggregate counts: opportunities posted/open, matches, shortlisted, placed |

## Why the scoring runs in SQL, not JS

`qualification_type` is a Postgres enum declared in ascending order
(`Grade 10` \u2192 `Postgraduate`), so `>=` comparisons on it work natively —
`highest_qualification >= $5::qualification_type` correctly expresses
"qualification at least this level" without a lookup table or app-side
ranking logic. The whole eligibility score is one parameterized query
against `learner_search_view`.

## TSP Dashboard routes (added on top of the employer routes)

Requires `003_tsp_dashboard.sql` and `seed_tsp.sql` applied after the employer
module's migrations. TSPs read from `tsp_candidate_view` (gated on
`visible_to_tsps`, not `visible_to_employers`) and write to a richer pipeline
than the employer's single shortlist step.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/tsp/opportunities?tsp_id=...` | List a TSP's programmes with per-stage pipeline counts |
| GET | `/api/tsp/opportunities/:id/candidates?province=&qualification=` | Same scoring logic as the employer endpoint, against `tsp_candidate_view`; also surfaces `prior_funded_programme_count` so a TSP can see funding-cap risk before enrolling someone |
| POST | `/api/tsp/opportunities/:id/pipeline` `{ learner_id, score, status }` | Moves a learner through `shortlisted \u2192 enrolled \u2192 completed`, or to `withdrawn` |
| GET | `/api/tsp/:id/dashboard` | Programmes posted/open, pipeline total, enrolled, completed |

Tested end-to-end: moved a candidate through matched \u2192 shortlisted \u2192 enrolled
and confirmed both the candidate list and dashboard counts updated correctly
after each step.

## Funder Portal routes (added on top of the employer/TSP routes)

Requires `004_funder_portal.sql` and `seed_funders.sql` applied after the TSP
module's migrations.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/funder/opportunities?funder_id=...` | List a funder's funded opportunities with per-status counts (matched/shortlisted/enrolled/completed/placed) |
| GET | `/api/funder/opportunities/:id/stats` | Per-opportunity breakdown: a count per pipeline status |
| GET | `/api/funder/:id/dashboard` | Aggregate counts across all of a funder's opportunities |
| GET | `/api/funder/opportunities/:id/report.csv` | CSV export of the same per-status counts — covers the spec's "export reports" requirement |
| GET | `/api/funder/opportunities/:id/candidates` | **Full-identity** scored candidate list — see below |

Tested end-to-end: seeded one funded opportunity with a shortlisted and a
placed candidate, confirmed `/opportunities`, `/stats`, `/dashboard`, and
`/report.csv` all agree, and confirmed the extended
`opportunities_single_poster` check constraint (now `num_nonnulls(employer_id,
tsp_id, funder_id) = 1`) rejects a row with two posters set.

### Candidate identity masking policy (resolved 2026-08-06)

This module originally shipped with **no candidate-list endpoint at all**,
specifically to avoid guessing at an unconfirmed client decision: the
brief's "name masked, location shown" language for the employer view was
never actually implemented (employer/TSP candidate views have always
returned full unmasked identity), and it was unclear whether funders
should follow the same unresolved pattern.

**Decision**: funders get the same full-identity view employers/TSPs
already have. Since employer/TSP were already unmasked, nothing needed
retrofitting there — this just extends the existing pattern. Funders
remain **read-only** on this endpoint (no shortlist/pipeline/placement
action) — operational recruitment stays with whichever employer or TSP is
actually running the opportunity; only who-can-*see* changed, not
who-can-*act*.

`GET /api/funder/opportunities/:id/candidates?province=&qualification=`
mirrors the employer/TSP scoring endpoints exactly, gated on
`visible_to_funders` instead of `visible_to_employers`, and — like the
other two — writes to `access_audit_log` on every view (POPIA
requirement, same as employer/TSP).

Tested end-to-end, including through the funder dashboard's new
Candidates tab in a browser: confirmed the list is empty until a learner
opts into `visible_to_funders`, confirmed full identity (not masked)
appears once they do, confirmed a funder can't view another funder's
opportunity's candidates (404) or an employer-posted opportunity's
candidates (404, wrong poster type), confirmed an employer-role token
gets 403 on the funder-only route, and confirmed the audit log entry
lands.

## Auth & RBAC

JWT-based login + role-based access control across all 5 roles, per the
spec's Section 2.2 ("JWT-based auth with role-based access control (RBAC)
— five distinct user types need distinct permission sets") and Section 3's
per-role restriction column.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` `{ email, password }` | Returns `{ token, role, profileId, email }`. Rate-limited to 10 attempts / 15 min per the spec's NFR ("rate-limited auth endpoints") |
| GET | `/api/auth/me` | Confirms/restores the current session from a stored token |

**How scoping works** (see `authenticate`, `requireRole`, `resolveScopeId`,
and `assertOwnsOpportunity` near the top of `server.js`):
- Every protected route requires `Authorization: Bearer <token>` — missing
  or invalid/expired tokens get a 401.
- `requireRole('employer'|'tsp'|'funder')` rejects the wrong role type
  with a 403 (an admin token satisfies any role check).
- List endpoints (`?employer_id=`, `?tsp_id=`, `?funder_id=`) silently
  force the query to the caller's own `profileId` for non-admins — a
  spoofed query param is simply overridden, not just rejected.
- Detail endpoints keyed off an opportunity id (`/opportunities/:id/...`)
  fetch the opportunity first, then check `opp.employer_id` /
  `opp.tsp_id` / `opp.funder_id` against the caller's `profileId`; a
  mismatch is a 403, not a data leak.
- `role: 'admin'` bypasses every ownership check — "Full access,
  audit-logged" per the spec's Admin row.

**Demo credentials** (all seeded accounts, password `Passw0rd!` after
`seed_auth.sql`):

| Role | Email |
|---|---|
| Employer | `hr@gautengfreight.co.za` / `hr@wctech.co.za` |
| TSP | `admin@ubuntuskills.co.za` |
| Funder | `admin@mictseta.org.za` |
| Admin | `admin@ascskillsconnect.co.za` |
| Learner | `nomvula.k@example.co.za` (and 4 more — no learner routes exist yet, see gaps below) |

**Audit logging**: `access_audit_log` (from `005_auth.sql`) records who
viewed candidate data and when — written on the two endpoints that expose
learner identities to an employer/TSP (`GET .../candidates`), covering the
spec's "audit logging of who accessed which learner's data" NFR. It's
deliberately not a log of every request — that's an infra/observability
concern, not this table's job.

Tested end-to-end: confirmed 401 with no token, 401 on wrong password, 403
when an employer token is used against another employer's dashboard, 403
when a TSP/funder-role token hits an employer-only route, 200 + full
visibility when the admin token is used against any organisation's data,
a real audit-log row written after a candidate-view call, and a real 429
after tripping the login rate limiter.

## Background matching job (worker.js)

The spec's "Background Job Processor" (section 2.1) — scoring no longer
only happens on-demand when someone opens a `/candidates` screen. Run it
alongside the API:

```bash
node server.js   # terminal 1
node worker.js   # terminal 2
```

Mechanism: `006_matching_job.sql` adds Postgres triggers that `pg_notify`
on two channels — `opportunity_created` (fires on `INSERT` into
`opportunities`) and `learner_profile_changed` (fires on a new learner,
or an `UPDATE` to `province`/`employment_status`/`highest_qualification`/
`date_of_birth`/visibility settings). `worker.js` `LISTEN`s on both, and
on each event re-runs the same eligibility-scoring logic as the
on-demand endpoints, upserting `'matched'` rows into `applications`
(`ON CONFLICT DO NOTHING` — never resets someone a human already moved to
`shortlisted`+) and writing a `notifications` row for anyone newly
matched. This is the "at minimum a Postgres trigger + worker" option the
project brief called out, chosen over a Redis/BullMQ queue since nothing
else in this stack needs a broker yet.

Runs against **all three poster types** (employer/TSP/funder), gated by
the matching `visible_to_*` flag — including funder-posted opportunities,
even though funders themselves never see candidate identities (see the
Funder Portal section above); the worker just needs `applications` rows
to exist so the funder's aggregate stats populate.

`opportunities.match_threshold` (added by this migration, default `50`)
makes the spec's "shortlist above a configurable threshold" (5.5) a real
per-opportunity value instead of an implicit constant.

**Known limitation, found while testing this**: Postgres `NOTIFY` doesn't
replay past events to a listener that wasn't connected yet — so an
opportunity or profile change that happens while `worker.js` isn't
running is silently missed (a job queue like BullMQ would persist and
retry; this doesn't). In practice this means: start `worker.js` before
seeding/testing, or accept that a restart can miss events. A production
version would want a reconciliation sweep (e.g. a periodic "score
anything unscored") as a backstop — not built here.

`GET /api/learner/:id/notifications` (auth-protected, ownership-scoped
like everything else) exists solely to make this observable via the API
instead of only by reading the `notifications` table directly — it's not
a real learner dashboard.

Tested end-to-end: inserted a new opportunity and watched the worker
auto-score all 5 seeded learners with hand-verified scores (100/100/75/
75/50) and write one notification each; updated a learner's province and
watched her get re-scored and newly matched against previously-missed
open opportunities with no duplicate notifications; toggled
`visible_to_funders` alone (no profile field touched) and confirmed the
added visibility trigger picks it up; confirmed a funder-posted
opportunity scores correctly once a learner is visible to funders.

## Admin console

Platform-wide reporting (spec 5.10) plus the two other Admin capabilities
from spec section 3's role table: "moderate opportunities" and "oversee
verification queue." No schema migration was needed — `verification_
records`, `learner_documents`, and the `access_audit_log` from the auth
module already existed; this module is the first thing that actually
*writes* a verification decision.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/dashboard` | Platform-wide stats: total/active/verified learners, available candidates, placements achieved, employment outcomes, org counts, opportunity counts, pending verifications |
| GET | `/api/admin/opportunities` | Every opportunity across all 3 poster types, with poster name/type and matched count — the moderation view |
| GET | `/api/admin/users` | Registry across all 5 roles, now including `status`/`suspended_at` |
| PATCH | `/api/admin/users/:id/status` `{ status: "active" \| "suspended" }` | Suspend/reactivate a user — see below |
| GET | `/api/admin/verification-queue` | Pending `verification_records`, oldest first |
| POST | `/api/admin/verification-records/:id/review` `{ status: "verified" \| "rejected" }` | The **only** place in this codebase that ever writes a non-pending status — enforces write-once (a second review attempt on an already-resolved record 404s) and writes to `access_audit_log` |

A few of the platform-dashboard metrics involved a judgment call, since
the spec names them ("Active learners," "Verified learners," "Employment
outcomes") without defining them precisely:
- **Active learners** = visible to at least one poster type (employer,
  TSP, or funder) — i.e. discoverable, not a private profile. There's no
  login/session-activity tracking to define "active" by recency.
- **Verified learners** = has a `verified` **ID** verification record
  specifically (not qualification/reference/employment) — the baseline
  trust signal, consistent with how DHA ID verification is treated as the
  fast/real-time Phase 2 integration in the spec's roadmap (Section 6).
- **Employment outcomes** = applications with status `placed` or
  `completed` — covers both an employer hire and a TSP programme
  completion, since the spec doesn't separate the two under this metric.

Tested end-to-end: every dashboard number hand-verified against the seed
data (5 learners, 4 verified-ID, 4 available, 1 placed application, 3
pending verifications, etc. — all matched exactly); approved a pending
qualification record and confirmed the queue count dropped and the
approval landed in `access_audit_log`; confirmed a second review attempt
on the same record 404s instead of silently overwriting; confirmed a
non-admin (employer) token gets 403 on every `/api/admin/*` route.

### User management: suspend/reactivate

`009_admin_user_management.sql` adds `users.status` (`'active'` /
`'suspended'`) and `users.suspended_at`. Closes the gap flagged when the
admin console first shipped read-only.

**Suspension takes effect immediately, not at token expiry.** `login()`
already rejected suspended users before issuing a token, but that alone
leaves a real gap: an already-issued JWT would keep working for the rest
of its `JWT_EXPIRES_IN` (8h default) even after being suspended. Fixed by
making `authenticate()` — the middleware every protected route runs
through — check the user's current `status` on every request (one
indexed primary-key lookup), not just verify the JWT signature. A
suspended user's existing token now fails on their very next call.

A self-suspend guard (`PATCH .../status` 400s if `id === req.auth.sub`)
prevents an admin locking themselves out by mistake. Every status change
writes to `access_audit_log`.

Tested end-to-end: confirmed a token issued *before* suspension still
returns 200, then 403 immediately after suspension with no other action
taken — same token, same request, only the DB row changed; confirmed
`POST /api/auth/login` itself is blocked for a suspended account;
confirmed reactivation restores login; confirmed an admin gets 400 trying
to suspend their own account and 403 attempting it as a non-admin;
confirmed through the actual admin dashboard's new Users tab in a
browser — suspended a real account by clicking Suspend, confirmed
`POST /api/auth/login` for that account failed server-side immediately
after, reactivated it, confirmed login worked again.

While fixing the SQL for `suspended_at`, avoided repeating a bug this
codebase already hit once: an earlier fix (notification delivery,
`worker.js`) had to move an `UPDATE ... SET x = $1, y = CASE WHEN $1 = ...`
pattern into two separate JS-computed values, because Postgres can't
always reconcile a single parameter used as both a plain `SET` value and
inside a `CASE` comparison in the same query ("inconsistent types
deduced for parameter $1"). Wrote this endpoint with the JS-computed
`suspendedAt` from the start instead of discovering the same bug twice.

## Opportunity creation

Closes the gap every prior module worked around: until now, every
opportunity in this repo was seeded directly via SQL because there was no
API path to create one. One shared pair of helpers
(`validateOpportunityInput`, `createOpportunity`) backs three thin
per-poster-type routes, since the payload shape is identical across
employer/TSP/funder and only the FK column differs.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/opportunities` | Employer creates an opportunity |
| POST | `/api/tsp/opportunities` | TSP creates a programme |
| POST | `/api/funder/opportunities` | Funder creates a funded opportunity |
| PATCH | `/api/opportunities/:id` `{ status?, match_threshold? }` | One shared route for all 3 poster types — ownership is checked against whichever of `employer_id`/`tsp_id`/`funder_id` is actually set on the row, so it doesn't need three near-identical copies |

**The poster's own id always comes from the auth token, never the
request body** — an employer cannot post an opportunity under another
employer's name even if they put a different `employer_id` in the JSON;
the field is silently ignored for non-admins (admins may specify one,
same pattern as everywhere else in this API).

**Creating an opportunity through the API fires the same
`006_matching_job.sql` trigger a raw SQL insert would** — the background
worker picks it up and auto-scores/notifies exactly as before. No new
integration code was needed for this; it's a direct consequence of the
matching job listening at the database level rather than the API level.

Tested end-to-end, including through the actual dashboard UI in a
browser (all three poster types, not just curl): missing `title` and an
invalid `opportunity_type` both 400 with a clear message; a real creation
succeeds and the worker immediately auto-scores/notifies against it;
another employer's token gets 403 trying to close an opportunity it
doesn't own; a TSP-role token gets 403 trying to hit the employer-only
creation route; and — the important security check — putting a different
organisation's `employer_id` in the POST body is silently ignored in
favour of the token's own id, confirmed by inspecting the created row.
Also added a small "New Opportunity"/"New Programme"/"New Funded
Opportunity" form to each of the three dashboards so posting one isn't
curl-only.

## Placement tracking

Wires up the `placements` table (has existed since `002_employer_search.sql`,
unused until now) — spec 5.9. **Shared across employer- and TSP-posted
opportunities.** Originally scoped employer-only, on the theory that a
TSP programme reaching `completed` is a training outcome ("Train"), not
an employment placement ("Place"). Revisited: a TSP is often the party
that actually knows when its own programme graduates get hired, so the
TSP dashboard now has the same confirm/track flow, gated on
`pipeline_status === 'completed'` rather than the employer's
`'shortlisted'`. Funder-posted opportunities are still deliberately
excluded — not for identity-masking reasons any more (funders can see
full candidate identity as of the masking-policy decision above), but
because operational recruitment stays with whichever employer/TSP is
actually running the opportunity; a funder confirming a placement isn't
a role the spec gives them.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/opportunities/:id/placements` `{ learner_id, start_date?, end_date?, notes? }` | Confirms a placement for a candidate with an existing application — moves it to `'placed'` and upserts the `placements` row. Employer, TSP, or admin; ownership resolved against whichever of `employer_id`/`tsp_id` the opportunity actually has |
| GET | `/api/employers/:id/placements`, `/api/tsp/:id/placements` | This organisation's confirmed placements, candidate name + opportunity + dates + status + notes |
| PATCH | `/api/placements/:id` `{ status?, end_date?, notes? }` | All three optional — a notes-only call (no status change) is valid, see below |
| GET | `/api/admin/placements` | Platform-wide placement report (spec 5.9's "produce placement reports"), now correctly includes TSP placements too |
| GET | `/api/admin/placements.csv` | Same report as CSV, including notes |

Tested end-to-end for both poster types: shortlisted a candidate as
employer, confirmed their placement; moved a TSP candidate through
`enrolled → completed`, confirmed their placement, marked it completed —
all through the actual TSP dashboard UI, not just curl. Confirmed a
second organisation's token gets 403 on both viewing and modifying a
placement it doesn't own, regardless of poster type. Confirmed
`admin/dashboard`'s `placements_achieved` and the TSP dashboard's new
`pipeline_placed` count both update correctly.

Caught and fixed three real bugs while generalizing this from
employer-only to shared:
1. The CSV export was rendering dates via `pg`'s Date-object `toString()`
   (a full verbose timestamp with timezone) instead of a plain
   `YYYY-MM-DD`.
2. `GET /api/admin/placements` and its CSV both used an **inner** join to
   `employer_profiles`, which would have silently *excluded every TSP
   placement* from the platform-wide report the moment one existed —
   found before it ever shipped, by asking "what happens when a
   TSP-posted opportunity flows through this same query." Fixed with a
   `LEFT JOIN` to both `employer_profiles` and `tsp_profiles` plus
   `COALESCE`.
3. The generic `PATCH /api/opportunities/:id` role check excluded
   `'admin'` from its allowed-roles array — since that check ran *before*
   `assertOwnsOpportunity`'s admin bypass ever got a chance to apply,
   admin could never patch any opportunity's status or threshold. Found
   while building the equivalent role check for placements and noticing
   the same pattern; confirmed with a regression test that admin can now
   PATCH an opportunity it doesn't own.

### Notes field

`010_placement_notes.sql` adds `placements.notes` — general-purpose, not
status-specific: useful context at creation ("started via referral"),
while active ("employer reports strong performance"), or as the reason
when a placement ends ("did not report for duty after week 2"). Same
pattern as `verification_records.review_notes`.

`PATCH /api/placements/:id` had `status` as a required field; it's now
optional, since a notes-only update (no status change) is a legitimate
call on its own — you can log a note on an active placement without
having to also transition its status. At least one of `status`,
`end_date`, `notes` is still required, so an empty PATCH 400s.

Notes is free text a real person types, unlike every other field this
API's CSV exports handle — those are all controlled-vocabulary values
(status enums, dates) that can be safely wrapped in quotes without
escaping. Notes needed actual CSV escaping (doubling embedded quotes),
tested with a note containing both a comma and a double-quote to confirm
the exported CSV parses back correctly rather than corrupting the row.

Tested end-to-end, including in the browser on both the employer and TSP
dashboards' Placements tabs: added a note to an active placement without
changing its status; combined a status change and a reason in the same
call (`terminated` + "did not report for duty..."); confirmed an empty
PATCH body 400s; confirmed the CSV-hostile note round-trips correctly
through the admin CSV export.

## Document storage

Real upload/download, closing the "`learner_documents.file_url` is just a
text column, nothing actually stores a file" gap. Backed by `storage.js` —
local disk for dev, but every function takes/returns the same shapes an
S3 client would (an opaque key string, a `Buffer`), so swapping in a real
S3-compatible client later means rewriting that one file, not any caller.
Files are **never** served through a static route — every read goes
through the ownership check below, since these are ID copies, CVs, and
certificates.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/learner/:id/documents` (multipart: `file`, `document_type`) | Learner-only (or admin). PDF/JPEG/PNG, 10MB max. Stores the file and inserts a `learner_documents` row (`verification_status` defaults to `'pending'` — the schema already had this) |
| GET | `/api/learner/:id/documents` | List of a learner's documents and their status |
| GET | `/api/documents/:id/download` | Streams the file back — owning learner or admin only |

Tested end-to-end: uploaded a real PDF and downloaded the exact bytes
back; confirmed another learner gets 403 trying to download someone
else's document; confirmed an employer token (not the owning learner, not
admin) also gets 403; confirmed admin can download any document; rejected
a `.exe` upload via mimetype filtering; confirmed an over-10MB upload is
rejected. Caught and fixed a real bug in the process: Multer throws its
own errors (e.g. file-too-large) from inside the upload middleware,
before any route handler's `try/catch` runs — without a dedicated error
handler, Express's default handler served an HTML page with a full
server-side stack trace (including file paths) instead of a clean JSON
error. Added a global Express error handler for this.

**Known limitation**: mimetype filtering is based on the `Content-Type`
the client declares, not on sniffing the file's actual bytes — a
determined uploader could send an `.exe` with a spoofed `image/png`
header. Real content-sniffing (e.g. `file-type`) would close this; not
added here since it wasn't necessary to demonstrate the storage wiring.

## Notification delivery (notifier.js)

`notifications` rows (written by `worker.js`, see above) now actually get
"delivered" — `notifier.js` is a pluggable delivery interface with one
provider registered: `console`, which logs the send and reports success.
**This is honestly a stub, not real delivery** — no email/SMS/WhatsApp/push
vendor account exists for this project, so nothing leaves the server.
Swapping in a real provider (SendGrid, Twilio, etc.) later means adding
one function to `notifier.js`'s `PROVIDERS` map, not touching any caller.
`007_notification_delivery.sql` adds `channel`/`delivery_status`/
`delivered_at` to `notifications` so a real provider has somewhere to
report back to.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/learner/:id/notifications` | Now also returns `channel`, `delivery_status`, `delivered_at` |
| PATCH | `/api/learner/notifications/:id/read` | Marks a notification read — ownership-scoped like everything else |

Tested end-to-end: triggered a new match, confirmed all 5 notifications
landed with `delivery_status: 'delivered'` and a real `delivered_at`
timestamp; marked one read via the API and confirmed another learner's
token gets 403 trying to mark someone else's. Caught and fixed a real bug
in the process: the first version's `UPDATE` reused the same `$1`
parameter for both the `SET` value and a `CASE WHEN $1 = 'delivered'`
comparison, and Postgres's parameter-type inference couldn't reconcile
`text` vs. `character varying` across the two uses (`error: inconsistent
types deduced for parameter $1`) — every delivery attempt was silently
failing until this was fixed by computing `delivered_at` in JS instead of
SQL.

## Verification vendor integration seam (verifier.js)

Spec section 6 is explicit that DHA ID verification and SAQA
qualification verification both require real accredited-vendor contracts
this project doesn't have (DHA has no direct public API; SAQA VeriSearch
needs a signed agreement). So this **is not a working DHA/SAQA
integration** — it's the pluggable seam `verification_records.provider`
was always meant to plug a real vendor into, plus one genuinely real
piece: SA ID number checksum validation (the standard Luhn-style check
digit every valid 13-digit SA ID satisfies). That's a legitimate
first-pass check any real system runs before even calling an accredited
vendor — it can confidently reject a malformed ID, but passing it is
*not* proof of identity, so it can never auto-resolve a record to
`'verified'`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/verification-records/:id/precheck` | Runs the automated pre-check: auto-rejects a malformed ID (with a reason), or leaves the record pending with a note for the human reviewer — this is spec 5.6's "review queue... where automated checks are inconclusive" |

`008_verification_vendor_seam.sql` adds `verification_records.
review_notes` so the pre-check's reasoning is visible in the queue
instead of only existing in the API response.

Tested end-to-end: ran the pre-check against a seeded learner whose ID
number fails the checksum — auto-rejected with a clear reason, landed in
`access_audit_log`, and `admin/dashboard`'s `pending_verifications` count
dropped immediately; ran it against a pending qualification record —
stayed pending with the honest "SAQA integration not built" note instead
of being silently resolved either way; confirmed a non-admin token gets
403.

## Learner registration

The 7-step wizard's actual backend (spec 5.1) — `migrations/001_schema.sql`
was built to match these steps from day one; this is the first code that
writes through it end to end. **No new migration needed** — every table
this touches already existed.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register-learner` | One transaction across `users`, `learner_profiles`, `learner_career_interests`, `learner_funded_programme_history`, `learner_visibility_settings`, `consent_records`, and two `verification_records` (`id` + `qualification`, both `'pending'`) — a failure partway through (e.g. a duplicate email) rolls everything back, never leaving an orphaned user row. Rate-limited like login. Returns a token — auto-logs in on success, same as `/api/auth/login` |
| GET | `/api/learner/:id/passport` | The Digital Skills Passport (spec 5.2): profile, verification badges, career interests, documents, funded-programme history, all in one place — what the wizard's Review step shows back, and what a learner could revisit later |
| GET | `/api/career-fields`, `/api/funders` | Public reference data — the wizard's Career Interests and Funded Programme History steps populate their options from these instead of a hardcoded list, since (unlike provinces/qualifications) these are real DB tables that could change |

**Real ID validation reused, not reimplemented**: registration calls the
same `verifier.isValidSaIdChecksum()` built for the admin pre-check — a
malformed ID number is rejected at signup with a 400, not silently
accepted and left for an admin to catch later.

**Registering fires the existing matching pipeline for free**: inserting
a `learner_profiles` row already triggers `006_matching_job.sql`'s
`pg_notify`, so a newly registered learner gets auto-scored against every
open opportunity they're visible to and notified of matches — zero new
integration code, just a consequence of building on top of a module that
already existed.

Tested end-to-end, including through the actual registration UI in a
browser (not just curl): a genuinely invalid ID checksum is rejected
(distinct from an all-zeros ID, which — like a test credit-card number —
trivially satisfies Luhn without being a bug); a duplicate ID number/
email correctly 409s; a full registration with career interests, funded
programme history, and custom visibility settings creates exactly the
right rows in all 6 tables; the new learner immediately shows up in
`admin/dashboard`'s counts; uploading a document right after registration
(reusing the existing document-storage endpoint) works and shows up in
the passport; another learner's token gets 403 on the new passport
endpoint; and — confirmed live in the browser — registering through the
UI correctly triggers the background worker to auto-match the new learner
against open opportunities.

## Learner application/browsing UI

A learner-initiated counterpart to the background matching job (spec 5.3):
until now, a learner could only be matched passively (the worker scoring
them against new opportunities). This lets a learner actively browse every
open opportunity and apply directly — no new migration needed, reuses the
existing `applications` table and status enum.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/learner/:id/opportunities?opportunity_type=&province=` | Every `status = 'open'` opportunity, scored against this learner's own profile with the same 4-criteria/25-points-each formula used everywhere else, plus this learner's `application_status` on each one (`null` if never applied). Optional query filters narrow by type/province |
| POST | `/api/learner/opportunities/:id/apply` | Idempotent — re-applying returns the existing row with `already_applied: true` instead of erroring or duplicating. 404s if the opportunity is closed or doesn't exist |
| POST | `/api/learner/opportunities/:id/withdraw` | Sets `status = 'withdrawn'`; the learner can later re-apply (a fresh `apply` call after a withdrawal is allowed, not blocked) |

**Same ownership pattern as everywhere else**: a learner can only browse/
apply/withdraw as themselves — `learner_id` always comes from the JWT
(`req.auth.profileId`), never trusted from the request body, except for
admin (who can act on behalf of any learner by passing `learner_id`
explicitly). Cross-learner browsing 403s.

**UI**: `asc_learner_registration_live.jsx` grew from a registration-only
wizard into a full portal — a returning learner now signs in
(`POST /api/auth/login`, rejecting non-learner accounts) into a "My
Learner Portal" view with two tabs: the existing Digital Skills Passport,
and a new Browse Opportunities tab (type/province filters, a "my
applications only" toggle, and per-card Apply/Withdraw/Re-apply buttons
driven off `application_status`). A freshly-completed registration now
flows into the same authenticated portal instead of a static one-off
passport view — one data path for "just registered" and "returning and
signed in."

Tested end-to-end in the browser (not just curl): signed in as an existing
learner (`nomvula.k@example.co.za`) and confirmed the passport tab still
renders correctly; browsed opportunities and confirmed scores matched
hand-calculated values (100/100/100/50 across the 4 seed opportunities,
with `Shortlisted` status already showing on 2 seeded applications);
applied to an unmatched opportunity via the UI and confirmed via curl
against `/api/learner/:id/opportunities` that `application_status` flipped
to `matched` server-side; withdrew it via the UI, confirming the button
switched to "Re-apply"; filtered by type and confirmed the list narrowed
correctly; toggled "my applications only" and confirmed it hid the
opportunity with no application history. Also confirmed via curl (before
the UI existed): cross-learner browse 403s, a spoofed `learner_id` in the
request body is ignored for non-admin tokens (applies as the actual token
owner instead), re-applying is idempotent (201 then 200 with
`already_applied: true`), and applying to a closed opportunity 404s.

## Known gaps (next module's job)
- No reconciliation sweep for missed `NOTIFY` events (see limitation above)
- No automated pre-check exists for `reference`/`employment` verification
  record types — only `id` (real checksum) and `qualification` (stub) are
  wired up, since those are the two the spec's Section 6 actually covers
- No way for a learner to edit their visibility settings after registering
  — they can browse/apply/withdraw now, but changing who can see their
  profile still requires going through the admin console
- No way to edit or delete an opportunity's eligibility requirements after
  creation — `PATCH /api/opportunities/:id` only covers `status` and
  `match_threshold`
- Funders can now see candidate identity (see Funder Portal section
  above) but still can't shortlist/act on a candidate — that stays with
  whichever employer/TSP runs the opportunity's operational recruitment,
  by design, not because it's unbuilt
- No way for a suspended user to appeal or for an admin to leave a reason
  — `PATCH /api/admin/users/:id/status` just flips the flag
