-- =====================================================================
-- ASC Skills Connect — Auth & audit logging
-- Builds on 001_schema.sql + 002/003/004 (must be run first, in that order)
-- =====================================================================

-- ---------------------------------------------------------------------
-- POPIA requires logging who accessed which learner's data (spec
-- section 7, Non-Functional Requirements). Scoped narrowly: only the
-- endpoints that actually expose learner-identifying data to an
-- employer/TSP write here (see server.js), not every authenticated
-- request — a full request log belongs to infra/observability, not
-- this table.
-- ---------------------------------------------------------------------
CREATE TABLE access_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_role    user_role NOT NULL,
  action        VARCHAR(60) NOT NULL,   -- e.g. 'view_candidates'
  target_type   VARCHAR(30) NOT NULL,   -- e.g. 'opportunity'
  target_id     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_actor ON access_audit_log (actor_user_id);
CREATE INDEX idx_audit_created ON access_audit_log (created_at);

-- No schema change needed for login itself — users.password_hash and
-- user_role (which already includes 'admin') were built for this from
-- the start (see 001_schema.sql). This migration only adds what login
-- didn't already have: the audit trail.
