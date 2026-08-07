-- =====================================================================
-- ASC Skills Connect — Funder Portal extension
-- Builds on 001_schema.sql + 002_employer_search.sql + 003_tsp_dashboard.sql
-- (must be run first, in that order)
-- =====================================================================

CREATE TYPE funder_type AS ENUM ('SETA', 'NSF', 'Corporate CSI', 'Government');

-- ---------------------------------------------------------------------
-- Funder accounts (parallel to employer_profiles / tsp_profiles).
-- funder_ref_id links back to the `funders` reference table (21 SETAs +
-- NSF) already in 001_schema.sql, for the SETA/NSF case. Corporate CSI and
-- Government funders won't have a row there, so it's nullable and
-- organisation_name carries the real identity for those.
-- ---------------------------------------------------------------------
CREATE TABLE funder_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  organisation_name VARCHAR(150) NOT NULL,
  funder_type       funder_type NOT NULL,
  funder_ref_id     SMALLINT REFERENCES funders(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Opportunities gain a third poster type, completing the pattern
-- 002/003 anticipated (see 003's comment on opportunities_single_poster).
-- ---------------------------------------------------------------------
ALTER TABLE opportunities ADD COLUMN funder_id UUID REFERENCES funder_profiles(id) ON DELETE CASCADE;
ALTER TABLE opportunities DROP CONSTRAINT opportunities_single_poster;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_single_poster
  CHECK (num_nonnulls(employer_id, tsp_id, funder_id) = 1);

CREATE INDEX idx_opportunities_funder ON opportunities (funder_id);

-- No funder-facing candidate view is added here on purpose. The spec
-- lists funders as read-mostly ("sees aggregate + funded-programme
-- data"), unlike employers/TSPs who explicitly get candidate profiles —
-- so the Funder Portal API (below) only ever returns counts, never
-- learner identities. This also means it doesn't need the
-- employer-view masking policy decided (still unconfirmed with the
-- client) to ship.
