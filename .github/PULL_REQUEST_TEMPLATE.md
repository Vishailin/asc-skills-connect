## What this changes

<!-- Which module/role, and why. -->

## How it was tested

<!--
Per CONTRIBUTING.md: this codebase's bar is "actually run it against a
real database," not just "looks correct." Please fill this in concretely:

- Ran `bash verify.sh` for a fresh DB? (yes/no)
- New/changed endpoints hit with curl — which scenarios (happy path,
  cross-tenant 403, spoofed IDs, empty/edge cases)?
- If a .jsx dashboard changed: clicked through it in a browser via
  `frontend/`?
-->

## Checklist

- [ ] Tested against a real PostgreSQL instance, not mocks
- [ ] New endpoints follow the existing RBAC/ownership pattern
      (`authenticate` + `requireRole` + ownership check; IDs come from
      the JWT, not the request body, for non-admins)
- [ ] New migrations are additive and numbered after the latest existing one
- [ ] No billing functionality included without prior sign-off
- [ ] Relevant README section(s) updated (`employer-api/README.md` for
      API changes, top-level `README.md` for What's built/Known gaps)
