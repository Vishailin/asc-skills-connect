-- =====================================================================
-- ASC Skills Connect — TSP Dashboard extension
-- Builds on 001_schema.sql + 002_employer_search.sql (must be run first)
-- =====================================================================

-- ---------------------------------------------------------------------
-- TSP accounts (parallel to employer_profiles, keyed off shared `users`)
-- ---------------------------------------------------------------------
CREATE TABLE tsp_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  organisation_name     VARCHAR(150) NOT NULL,
  accreditation_number  VARCHAR(60),
  accrediting_seta_id   SMALLINT REFERENCES funders(id),   -- reuses the SETA reference table from the learner DB
  province              VARCHAR(30),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Opportunities can now be posted by either an employer or a TSP.
-- Generalising to a full poster-type enum (adding funders later) is the
-- natural next step; a nullable-FK-plus-check gets us there without a
-- breaking migration when that happens.
-- ---------------------------------------------------------------------
ALTER TABLE opportunities ALTER COLUMN employer_id DROP NOT NULL;
ALTER TABLE opportunities ADD COLUMN tsp_id UUID REFERENCES tsp_profiles(id) ON DELETE CASCADE;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_single_poster
  CHECK (num_nonnulls(employer_id, tsp_id) = 1);

CREATE INDEX idx_opportunities_tsp ON opportunities (tsp_id);

-- ---------------------------------------------------------------------
-- Pipeline stages: TSPs manage learners through more steps than an
-- employer's simple shortlist. Extends the existing application_status
-- enum rather than introducing a parallel status column, so both
-- dashboards keep reading/writing the same `applications` table.
-- ---------------------------------------------------------------------
ALTER TYPE application_status_type ADD VALUE IF NOT EXISTS 'enrolled';
ALTER TYPE application_status_type ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE application_status_type ADD VALUE IF NOT EXISTS 'withdrawn';

-- ---------------------------------------------------------------------
-- Mirror of learner_search_view's employer flavour, but respecting the
-- visible_to_tsps flag instead. Kept as a separate view (rather than a
-- parameter) so both dashboards can be granted access independently.
-- ---------------------------------------------------------------------
CREATE VIEW tsp_candidate_view AS
SELECT
  lp.id AS learner_id,
  lp.full_name,
  lp.surname,
  lp.province,
  lp.municipality,
  lp.highest_qualification,
  lp.employment_status,
  lp.work_experience,
  lp.availability_status,
  EXTRACT(YEAR FROM age(lp.date_of_birth))::INT AS age,
  lvs.visible_to_tsps,
  (SELECT status FROM verification_records vr WHERE vr.learner_id = lp.id AND vr.record_type = 'id' ORDER BY created_at DESC LIMIT 1) AS id_verification_status,
  (SELECT status FROM verification_records vr WHERE vr.learner_id = lp.id AND vr.record_type = 'qualification' ORDER BY created_at DESC LIMIT 1) AS qualification_verification_status,
  (SELECT array_agg(cf.name) FROM learner_career_interests lci JOIN career_fields cf ON cf.id = lci.field_id WHERE lci.learner_id = lp.id) AS career_interests,
  -- surfaces prior funded-programme use directly, since TSPs specifically
  -- need to check funding-cap eligibility before enrolling someone
  (SELECT count(*) FROM learner_funded_programme_history h WHERE h.learner_id = lp.id) AS prior_funded_programme_count
FROM learner_profiles lp
JOIN learner_visibility_settings lvs ON lvs.learner_id = lp.id
WHERE lvs.visible_to_tsps = TRUE;
