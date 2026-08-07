# Learner Registration Database — ASC Skills Connect

PostgreSQL schema for ASC Skills Connect, covering all five roles
(learner, employer, TSP, funder, admin). Originally built to match the
7-step learner registration wizard field-for-field; grown module-by-module
since, each migration tested end-to-end against a live Postgres instance
before moving on (see `verify.sh` in the repo root).

## Layout

```
migrations/   001_schema.sql ... 008_verification_vendor_seam.sql  (apply in order)
seeds/        001_learners.sql ... 005_auth.sql                    (apply in order, after migrations)
```

Numbered so a plain lexical sort is also the correct apply order —
`verify.sh` just loops over both folders in filename order rather than
listing each file individually.

| # | Migration | Adds |
|---|---|---|
| 001 | `schema.sql` | Core learner schema: `users`, `learner_profiles`, `career_fields`, `learner_documents`, `funders` (21 SETAs + NSF), `learner_funded_programme_history`, `learner_visibility_settings`, `consent_records`, `verification_records`, `learner_search_view` |
| 002 | `employer_search.sql` | `employer_profiles`, `opportunities`, `applications`, `placements` |
| 003 | `tsp_dashboard.sql` | `tsp_profiles`; generalizes `opportunities` to employer-or-tsp poster; extends `application_status_type` |
| 004 | `funder_portal.sql` | `funder_profiles`; generalizes `opportunities` to a three-way employer/tsp/funder poster (`num_nonnulls(employer_id, tsp_id, funder_id) = 1`) |
| 005 | `auth.sql` | `access_audit_log` (POPIA access-logging requirement) |
| 006 | `matching_job.sql` | `notifications`, `opportunities.match_threshold`, `pg_notify` triggers driving `employer-api/worker.js` (the spec's Background Job Processor) |
| 007 | `notification_delivery.sql` | `notifications.channel` / `.delivery_status` / `.delivered_at`, for `employer-api/notifier.js` |
| 008 | `verification_vendor_seam.sql` | `verification_records.review_notes`, for `employer-api/verifier.js`'s automated pre-check |

## How the learner registration wizard steps map to tables

| Wizard step | Table(s) |
|---|---|
| 1. Personal Info | `users`, `learner_profiles` |
| 2. Education & Docs | `learner_profiles` (summary fields) + `learner_documents` |
| 3. Employment | `learner_profiles.employment_status` / `.work_experience` |
| 4. Career Interests | `career_fields` + `learner_career_interests` (many-to-many) |
| 5. Funded Programme History | `funders` (21 SETAs + NSF) + `learner_funded_programme_history` |
| 6. Consent & Visibility | `learner_visibility_settings` + `consent_records` (audit trail) |
| 7. Review / Digital Skills Passport | `learner_search_view` (reads across everything) |

## Key design decisions (see `employer-api/README.md` for the module-level ones)

- **"No prior funded programmes" needs no flag.** A learner who answers "No" in
  step 5 simply has zero rows in `learner_funded_programme_history` — no
  separate boolean to keep in sync.
- **Verification is write-once, admin/vendor-owned.** Registration only ever
  creates `pending` rows in `verification_records`. The only code path that
  writes `verified`/`rejected` is the admin console's review endpoint (and
  its automated pre-check, which can only auto-reject, never auto-verify —
  see `verifier.js`).
- **Consent is an append-only log, not just a checkbox.** `consent_records`
  stores the exact consent text shown and a timestamp, with `withdrawn_at` for
  revocation — POPIA needs an auditable trail, not just today's setting.
  `learner_visibility_settings` holds the current, editable state the learner
  actually toggles.
- **`learner_search_view` / `tsp_candidate_view`** are what the employer and
  TSP search modules query — pre-joined, respecting visibility, so
  search/filter logic stays out of the application layer. Funder-posted
  opportunities deliberately have no equivalent candidate view (see the
  Funder Portal section of `employer-api/README.md`).

## Running it locally

The whole database, from a clean drop, in one command:

```bash
bash verify.sh
```

Or by hand:

```bash
createdb learner_registration_database
for f in learner_registration_database/migrations/*.sql; do psql -d learner_registration_database -f "$f"; done
for f in learner_registration_database/seeds/*.sql; do psql -d learner_registration_database -f "$f"; done
```

Sanity-check query (what an employer searching Gauteng candidates would run):

```sql
SELECT full_name, province, highest_qualification, availability_status,
       id_verification_status, qualification_verification_status, career_interests
FROM learner_search_view
WHERE province = 'Gauteng' AND visible_to_employers = TRUE
ORDER BY full_name;
```

## Not yet built

- Actual object storage — `employer-api/storage.js` provides real
  upload/download today, but on local disk, not S3 (see its README section
  for how it's structured to swap later)
- A funder-facing candidate view (deliberately deferred — see
  `employer-api/README.md`'s Funder Portal section)
- Real DHA/SAQA vendor integration (needs contracts this project doesn't
  have — see `verifier.js`) and real notification delivery (needs a real
  email/SMS/WhatsApp provider — see `notifier.js`)
- Learner registration is now built end-to-end (wizard + transactional API
  + Digital Skills Passport view — see `employer-api/README.md`'s Learner
  registration section), but there's still no learner-facing way to browse
  opportunities or apply directly — see the top-level `README.md`'s gap
  list for the full picture
