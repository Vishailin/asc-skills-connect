# ASC Skills Connect — Project Brief & Handoff

Prepared for continuing this build in Claude Code. Everything below reflects
decisions actually made and code actually tested in the design conversation
that produced these files — not aspirational scope.

## What this is

ASC Skills Connect is a workforce development platform for Africa Skills
Connect (Pty) Ltd (a QCTO/SETA-accredited training company). It connects
learners, employers, training providers (TSPs), and funders (SETAs/NSF/
corporate CSI) through one journey: **Register → Verify → Match → Train →
Place → Track Employment**.

The full requirements are in `ASC_Skills_Connect_Technical_Spec.docx` —
read that first if anything below is ambiguous. This brief is the "what's
actually built vs. what's left" layer on top of it.

## Build approach

Agreed approach: build module by module, test each one for real (not just
write code — actually run it), then package into one deployable system at
the end. Every module below was tested against a live PostgreSQL instance
and, where applicable, a running Node API, with curl — not just written and
assumed correct.

## Files delivered so far

```
ASC_Skills_Connect_Technical_Spec.docx      — full technical spec (read this first)

asc_skills_connect_demo.jsx                 — early 3-step connected demo (register→match→employer view, mock data)
asc_learner_registration.jsx                — full 7-step learner registration wizard (mock data, standalone)

learner_registration_database/
  schema.sql                                — core learner schema: users, learner_profiles, career_fields,
                                                learner_documents, funders (21 SETAs + NSF), 
                                                learner_funded_programme_history, learner_visibility_settings,
                                                consent_records, verification_records, learner_search_view
  seed.sql                                  — 5 sample learners
  002_employer_search.sql                   — adds employer_profiles, opportunities, applications, placements
  seed_employers.sql                        — 2 sample employers + 2 sample opportunities
  003_tsp_dashboard.sql                     — adds tsp_profiles, generalizes opportunities to employer-OR-tsp poster,
                                                extends application status enum (+enrolled/completed/withdrawn),
                                                adds tsp_candidate_view
  seed_tsp.sql                              — 1 sample TSP + 1 sample programme + pipeline test data
  README.md                                 — schema documentation, run instructions

employer-api/
  server.js                                 — Express API: employer routes + TSP routes (same server, both dashboards)
  package.json
  README.md                                 — endpoint documentation, tested-endpoint list

asc_employer_dashboard_live.jsx             — employer dashboard/search UI wired to real fetch() calls against the API
asc_tsp_dashboard_live.jsx                  — TSP dashboard/pipeline UI wired to the same API
```

**Apply the SQL files in this order:** `schema.sql` → `002_employer_search.sql`
→ `003_tsp_dashboard.sql`, then the three seed files in any order
(`seed.sql`, `seed_employers.sql`, `seed_tsp.sql`).

## Key design decisions already made (don't relitigate these without reason)

- **Verification is write-once, admin/vendor-owned.** No learner-facing UI
  or API path lets a learner mark their own ID or qualification "verified."
  Registration only ever creates `pending` rows in `verification_records`.
- **"No prior funded programmes" needs no flag.** A learner who says "No"
  in the funding-history step just has zero rows in
  `learner_funded_programme_history` — don't add a redundant boolean.
- **Consent is an append-only audit log, separate from current settings.**
  `consent_records` stores the exact consent text + timestamp + optional
  withdrawal timestamp. `learner_visibility_settings` holds the current,
  editable toggle state the learner actually changes day to day. Don't
  collapse these into one table — POPIA needs the history.
- **Opportunities have a single poster, generalized via nullable FKs + a
  check constraint** (`num_nonnulls(employer_id, tsp_id) = 1`), not a
  polymorphic/inheritance pattern. When the Funder Portal is built, add
  `funder_id` the same way and extend the constraint to
  `num_nonnulls(employer_id, tsp_id, funder_id) = 1`.
- **Pipeline status is one shared enum**
  (`matched/shortlisted/enrolled/completed/withdrawn`) on the `applications`
  table, not separate status columns per poster type. Employers currently
  only use `matched → shortlisted`; TSPs use the full chain. Keep it this
  way so both dashboards read/write the same table.
- **Qualification comparisons rely on Postgres enum declaration order.**
  `qualification_type` was declared `Grade 10 → Postgraduate` in ascending
  order specifically so `highest_qualification >= 'Matric'` works natively
  in SQL. Don't refactor this to a lookup table without a reason — it's
  intentional and it's what makes the eligibility-scoring queries a single
  clean SQL statement instead of app-side ranking logic.
- **Employer-facing candidate view masks identity, not location.** The
  registration wizard's review screen shows employers a partially-masked
  name and no ID/contact details, but does show province/municipality.
  (Note: this was my default assumption, not explicitly confirmed by the
  client — worth a quick check before shipping.)
- **No billing at launch.** Subscription tier fields exist on
  `employer_profiles` (`Basic/Standard/Premium`) but nothing enforces or
  charges against them yet. Revenue model is deliberately deferred to a
  later phase per the spec.
- **DHA/SAQA/SETA verification has no open public API** — confirmed by
  research during the spec, not assumed. DHA identity checks require going
  through an accredited third-party vendor; SAQA qualification verification
  (VeriSearch/NLRD) is a contracted service with real turnaround time, not
  instant; SETA verification is per-SETA (21 of them) and largely manual.
  The schema's `verification_records.provider` field and
  `pending/verified/rejected` status model were built with this in mind —
  don't design around an assumption of instant, unified government APIs.

## What's built and tested vs. what's still a gap

### Done and tested live
- Learner registration data model + UI (mock-data UI; real schema tested with live Postgres)
- Employer Search & Dashboard: search/filter/score/shortlist, all against real queries
- TSP Dashboard: programme list, candidate pipeline with stage progression, prior-funding-history flag, all against real queries

### Explicitly deferred / not built yet (in spec priority order)
1. **Funder Portal** — SETA/NSF/corporate CSI view: advertise funded opportunities, view recruitment/placement stats, export reports. Mostly read-heavy; reuse the `funders` table already in the schema.
2. **Background matching job** — right now, eligibility scoring runs on-demand when someone opens a candidates screen. The spec calls for automatic scoring + learner notification the moment an opportunity is posted. Needs a job queue (or at minimum a Postgres trigger + worker) — not built.
3. **Admin console + platform-wide reporting dashboard** — the spec's "ASC Dashboard" (total/active/verified learners, placements, employer/opportunity activity across the whole platform, not scoped to one employer/TSP). Nothing built yet.
4. **Auth / session management** — every API endpoint currently takes an ID as a query/body param with no login, token, or session behind it. This is a real gap before anything goes near production, not just a nice-to-have.
5. **Real file storage** — `learner_documents.file_url` is a plain text column expecting an object-storage URL. No actual upload/storage wiring exists (the registration UI simulates file selection only).
6. **Verification vendor integration** — Phase 2 (DHA-accredited ID vendor) and Phase 3 (SAQA VeriSearch, SETA workflows) from the spec's roadmap. Schema is ready for it; no vendor is actually wired in.
7. **Notification service** — email/SMS/WhatsApp/push for opportunity matches, verification status changes, application updates. Not built.
8. **Placement tracking UI/reports** — the `placements` table exists (from `002_employer_search.sql`) but nothing reads or writes to it yet; no placement-confirmation flow exists on either the employer or TSP side.
9. **Revenue/billing** — Phase 4 in the spec, deliberately deferred.
10. **AI features** (candidate ranking beyond rules-based, CV analysis, career guidance, recruitment assistant) — explicitly post-launch per the spec.
11. **Final packaging** — nothing has been assembled into one coherent deployable repo yet (proper `migrations/` folder instead of numbered loose SQL files, environment-variable config instead of hardcoded connection details in `server.js`, a single build/deploy process, etc.). This was always the intended last step, not something skipped by accident.

## Suggested order to keep going

Given what's already built, the Funder Portal is the natural next module —
it completes the three-poster-type pattern the schema already anticipates
and reuses most of the employer/TSP dashboard code shape. After that, Auth
and the background matching job are the two gaps most worth closing before
this looks like something that could actually go live, even in early form.

## One open question worth resolving early

The employer-view masking decision above (name masked, location shown) was
never explicitly confirmed — two clarifying questions were asked about it
and about learner self-verification, and the conversation moved on before
they were answered. The self-verification one was resolved unambiguously
later (admin/vendor-only, confirmed via the "not self-declared" schema
design). The masking one wasn't revisited. Worth a two-minute check before
building the Funder Portal, since funders will need their own visibility
rules and it's worth deciding the pattern once.
