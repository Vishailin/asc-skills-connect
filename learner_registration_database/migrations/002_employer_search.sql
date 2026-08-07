-- =====================================================================
-- ASC Skills Connect — Employer Search & Dashboard extension
-- Builds on learner_registration_database/001_schema.sql (must be run first)
-- =====================================================================

CREATE TYPE opportunity_type AS ENUM ('Learnership', 'Internship', 'Apprenticeship', 'Employment', 'Skills Programme', 'Bursary');
CREATE TYPE application_status_type AS ENUM ('matched', 'shortlisted', 'placed', 'rejected');

-- ---------------------------------------------------------------------
-- Employer accounts (parallel to learner_profiles, keyed off shared `users`)
-- ---------------------------------------------------------------------
CREATE TABLE employer_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name    VARCHAR(150) NOT NULL,
  province        VARCHAR(30),
  subscription_tier VARCHAR(20) NOT NULL DEFAULT 'Basic' CHECK (subscription_tier IN ('Basic', 'Standard', 'Premium')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Opportunities, with the Smart Eligibility Engine's weighted criteria
-- stored as columns (simple v1 — same 4 criteria as the spec's worked
-- example; a JSONB `criteria` column is the natural next step if
-- criteria sets need to vary per opportunity beyond these four).
-- ---------------------------------------------------------------------
CREATE TABLE opportunities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id         UUID NOT NULL REFERENCES employer_profiles(id) ON DELETE CASCADE,
  title               VARCHAR(150) NOT NULL,
  opportunity_type    opportunity_type NOT NULL,
  funding_source      VARCHAR(60),          -- e.g. 'SETA-funded', 'Employer-funded'
  status              VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),

  -- eligibility criteria (mirrors the province/age/employment/qualification example)
  req_province        VARCHAR(30),
  req_age_min         SMALLINT,
  req_age_max         SMALLINT,
  req_employment_status employment_status_type,
  req_qualification_min qualification_type,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_opportunities_employer ON opportunities (employer_id);
CREATE INDEX idx_opportunities_status ON opportunities (status);

-- ---------------------------------------------------------------------
-- Applications / shortlist — one row per (learner, opportunity) pair.
-- Created by the matching engine ('matched'), updated by employer action.
-- ---------------------------------------------------------------------
CREATE TABLE applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id      UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  opportunity_id  UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  eligibility_score SMALLINT NOT NULL CHECK (eligibility_score BETWEEN 0 AND 100),
  status          application_status_type NOT NULL DEFAULT 'matched',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (learner_id, opportunity_id)
);

CREATE INDEX idx_applications_opportunity ON applications (opportunity_id);
CREATE INDEX idx_applications_learner ON applications (learner_id);

-- QCTO placement tracking sits on top of a 'placed' application — kept
-- separate because a placement has its own dates independent of the
-- application lifecycle.
CREATE TABLE placements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  start_date      DATE,
  end_date        DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'terminated')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
