# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a security
vulnerability. Instead, email **africaskillsconnect@gmail.com** with:

- A description of the issue and its potential impact
- Steps to reproduce (a curl command is ideal, per the testing style used
  throughout this repo)
- Any suggested fix, if you have one

This is a small project maintained on a best-effort basis, not a company
with a dedicated security team — please be patient. You'll get an
acknowledgment as soon as it's seen, and a fix or mitigation timeline
once the report is triaged.

## Supported versions

There's a single `master` branch and no formal release/versioning yet —
security fixes land there. If that changes, this section will be updated.

## Scope

This covers the code in this repository: `employer-api/` (the Express
API), the database schema/migrations, and the five `asc_*_live.jsx`
dashboards. It does **not** cover:

- Third-party dependencies themselves — report those upstream (though a
  heads-up here is still welcome so we can bump the version)
- The `frontend/` Vite scaffold — it's a dev-only preview tool, never
  deployed

## Known posture, so reports aren't duplicates

A few things are already known and intentional, not vulnerabilities:

- **`JWT_SECRET` has an insecure dev-only default** if unset — `server.js`
  prints a warning on startup for exactly this reason. It must be set to
  a real secret in `.env` before any non-local deployment.
- **No real identity/qualification verification vendor is wired in.**
  `verifier.js` does a real SA ID checksum pre-check plus an honest SAQA
  *stub* — this is a known, documented gap (see the top-level README's
  "Known gaps"), not a bug.
- **Notification delivery is a console-log stub** (`notifier.js`) — no
  real email/SMS/WhatsApp provider is connected yet.
- **File uploads** go through `multer@^2.0.0` specifically (an earlier
  1.x version was flagged as vulnerable and replaced before this was
  ever shipped) and are stored on local disk behind an S3-shaped
  interface — reports about the *storage design* (e.g. "this should be
  S3") are a known future step, not a security bug on their own.

Design decisions that already account for common risk areas: JWT auth
with role-based access control checked on every request (including
immediate effect on account suspension, not deferred to token expiry),
ownership of resources always derived server-side from the auth token
rather than trusted from the request body, rate-limiting on login/
registration, and a POPIA-driven audit log (`access_audit_log`) on
endpoints that expose learner personal data.

If you find a way around any of the above, that's exactly the kind of
report this policy wants.
