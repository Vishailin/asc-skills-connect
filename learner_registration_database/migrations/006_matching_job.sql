-- =====================================================================
-- ASC Skills Connect — Background Job Processor (spec section 2.1)
-- Builds on 001_schema.sql + 002/003/004/005 (must be run first, in order)
-- =====================================================================

-- "builds a shortlist above a configurable threshold" (spec 5.5) — was
-- implicit/hardcoded nowhere before this; now it's a real per-opportunity
-- knob the worker reads, defaulting to 50 (half the 4-criteria score).
ALTER TABLE opportunities ADD COLUMN match_threshold SMALLINT NOT NULL DEFAULT 50
  CHECK (match_threshold BETWEEN 0 AND 100);

-- ---------------------------------------------------------------------
-- In-app notification record. This is what a real email/SMS/WhatsApp
-- Notification Service (still not built — see the project brief's gap
-- list) would read from and actually deliver; creating this row is as
-- far as "notify matched learners" (spec 5.5) goes in this module.
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id      UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  opportunity_id  UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  type            VARCHAR(30) NOT NULL DEFAULT 'matched',
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at         TIMESTAMPTZ,
  UNIQUE (learner_id, opportunity_id, type)
);

CREATE INDEX idx_notifications_learner ON notifications (learner_id);

-- ---------------------------------------------------------------------
-- LISTEN/NOTIFY triggers — the "at minimum a Postgres trigger + worker"
-- option the project brief called out, chosen over a Redis/BullMQ queue
-- since nothing else in this stack needs a broker yet. employer-api/
-- worker.js LISTENs on these two channels and does the actual scoring.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_opportunity_created() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('opportunity_created', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_opportunity_created
  AFTER INSERT ON opportunities
  FOR EACH ROW EXECUTE FUNCTION notify_opportunity_created();

-- Fires on a new learner (never scored yet) and on any update to the
-- fields the eligibility engine actually reads (spec 5.4: "re-run
-- automatically whenever a learner updates their profile").
CREATE OR REPLACE FUNCTION notify_learner_profile_changed() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('learner_profile_changed', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_learner_profile_inserted
  AFTER INSERT ON learner_profiles
  FOR EACH ROW EXECUTE FUNCTION notify_learner_profile_changed();

CREATE TRIGGER trg_learner_profile_updated
  AFTER UPDATE OF province, employment_status, highest_qualification, date_of_birth
  ON learner_profiles
  FOR EACH ROW EXECUTE FUNCTION notify_learner_profile_changed();

-- A learner flipping a visibility toggle on (e.g. turning on
-- visible_to_funders) is functionally the same as a profile change from
-- the matching engine's point of view — it can newly qualify them for
-- opportunities they were already eligible for but invisible to. Needs
-- its own trigger function since this table's row identity column is
-- learner_id, not id.
CREATE OR REPLACE FUNCTION notify_learner_visibility_changed() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('learner_profile_changed', NEW.learner_id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_learner_visibility_updated
  AFTER UPDATE OF visible_to_employers, visible_to_tsps, visible_to_funders
  ON learner_visibility_settings
  FOR EACH ROW EXECUTE FUNCTION notify_learner_visibility_changed();
