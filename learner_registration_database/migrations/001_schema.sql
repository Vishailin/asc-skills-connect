-- =====================================================================
-- ASC Skills Connect — Learner Registration Database
-- Maps directly to the 7-step registration wizard (asc_learner_registration.jsx)
-- Engine: PostgreSQL 14+
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";    -- case-insensitive email

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('learner', 'employer', 'tsp', 'funder', 'admin');
CREATE TYPE gender_type AS ENUM ('Female', 'Male', 'Non-binary', 'Prefer not to say');
CREATE TYPE employment_status_type AS ENUM ('Unemployed', 'Employed', 'Self-Employed');
CREATE TYPE experience_band_type AS ENUM ('No Experience', 'Less than 1 Year', '1-2 Years', '3-5 Years', '5+ Years');
CREATE TYPE qualification_type AS ENUM ('Grade 10', 'Grade 11', 'Matric', 'Certificate', 'Diploma', 'Degree', 'Postgraduate');
CREATE TYPE document_type AS ENUM ('id_copy', 'cv', 'certificate', 'transcript');
CREATE TYPE verification_status_type AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE programme_outcome_type AS ENUM ('Completed', 'Did not complete');

-- ---------------------------------------------------------------------
-- Core accounts (shared across learner/employer/tsp/funder/admin)
-- Step: n/a — created on sign-up, before the wizard starts
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role            user_role NOT NULL,
  email           CITEXT NOT NULL UNIQUE,
  mobile          VARCHAR(10) UNIQUE,           -- SA format: 0XXXXXXXXX
  password_hash   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Step 1: Personal Info
-- ---------------------------------------------------------------------
CREATE TABLE learner_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name           VARCHAR(100) NOT NULL,
  surname             VARCHAR(100) NOT NULL,
  id_number           CHAR(13) NOT NULL UNIQUE,        -- SA 13-digit ID number
  date_of_birth       DATE NOT NULL,
  gender              gender_type NOT NULL,
  disability_status   VARCHAR(60),                      -- free text from a controlled list; optional
  province            VARCHAR(30) NOT NULL,
  municipality        VARCHAR(80) NOT NULL,

  -- Step 3: Employment
  employment_status   employment_status_type NOT NULL DEFAULT 'Unemployed',
  work_experience     experience_band_type NOT NULL DEFAULT 'No Experience',

  -- Step 2: Education (single "highest qualification" summary — detail rows below)
  highest_qualification qualification_type NOT NULL DEFAULT 'Matric',
  field_of_study      VARCHAR(120),
  institution         VARCHAR(150),
  year_completed      SMALLINT CHECK (year_completed BETWEEN 1970 AND 2100),

  -- Availability drives search/matching (Digital Skills Passport)
  availability_status VARCHAR(20) NOT NULL DEFAULT 'Available'
                       CHECK (availability_status IN ('Available', 'Employed', 'Studying')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_learner_province ON learner_profiles (province);
CREATE INDEX idx_learner_qualification ON learner_profiles (highest_qualification);
CREATE INDEX idx_learner_availability ON learner_profiles (availability_status);
CREATE INDEX idx_learner_employment ON learner_profiles (employment_status);

-- ---------------------------------------------------------------------
-- Step 4: Career Interests (multi-select) — reference table + join table
-- ---------------------------------------------------------------------
CREATE TABLE career_fields (
  id    SMALLSERIAL PRIMARY KEY,
  name  VARCHAR(60) NOT NULL UNIQUE
);

INSERT INTO career_fields (name) VALUES
  ('Administration'), ('ICT'), ('Supply Chain'), ('Retail'), ('Contact Centre'),
  ('Renewable Energy'), ('Construction'), ('Manufacturing'), ('Finance'), ('Drone Operations');

CREATE TABLE learner_career_interests (
  learner_id  UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  field_id    SMALLINT NOT NULL REFERENCES career_fields(id),
  PRIMARY KEY (learner_id, field_id)
);

-- ---------------------------------------------------------------------
-- Step 2: Supporting documents
-- ---------------------------------------------------------------------
CREATE TABLE learner_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id          UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  document_type       document_type NOT NULL,
  file_url            TEXT NOT NULL,               -- pointer into object storage (S3-compatible)
  verification_status verification_status_type NOT NULL DEFAULT 'pending',
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at         TIMESTAMPTZ
);

CREATE INDEX idx_documents_learner ON learner_documents (learner_id);

-- ---------------------------------------------------------------------
-- Step 5: Previous NSF / SETA-funded programme history
-- ---------------------------------------------------------------------
CREATE TABLE funders (
  id      SMALLSERIAL PRIMARY KEY,
  name    VARCHAR(60) NOT NULL UNIQUE,
  is_seta BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO funders (name, is_seta) VALUES
  ('AGRISETA', TRUE), ('BANKSETA', TRUE), ('CATHSSETA', TRUE), ('CHIETA', TRUE), ('CETA', TRUE),
  ('ETDP SETA', TRUE), ('EWSETA', TRUE), ('FASSET', TRUE), ('FoodBev SETA', TRUE), ('FP&M SETA', TRUE),
  ('HWSETA', TRUE), ('INSETA', TRUE), ('LGSETA', TRUE), ('merSETA', TRUE), ('MICT SETA', TRUE),
  ('MQA', TRUE), ('PSETA', TRUE), ('SASSETA', TRUE), ('Services SETA', TRUE), ('TETA', TRUE),
  ('W&RSETA', TRUE), ('National Skills Fund (NSF)', FALSE), ('Not sure / other', FALSE);

CREATE TABLE learner_funded_programme_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id          UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  programme_name      VARCHAR(150) NOT NULL,
  funder_id           SMALLINT REFERENCES funders(id),
  programme_year      SMALLINT CHECK (programme_year BETWEEN 1990 AND 2100),
  outcome             programme_outcome_type NOT NULL DEFAULT 'Completed',
  led_to_employment   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_funded_history_learner ON learner_funded_programme_history (learner_id);
-- Fast lookup for "has this person already used state-funded learnership capacity"
CREATE INDEX idx_funded_history_funder ON learner_funded_programme_history (funder_id) WHERE outcome = 'Completed';

-- A learner who answered "No" to prior funding simply has zero rows here — no separate flag needed.

-- ---------------------------------------------------------------------
-- Step 6: Visibility & POPIA consent
-- ---------------------------------------------------------------------
CREATE TABLE learner_visibility_settings (
  learner_id          UUID PRIMARY KEY REFERENCES learner_profiles(id) ON DELETE CASCADE,
  visible_to_employers BOOLEAN NOT NULL DEFAULT TRUE,
  visible_to_tsps      BOOLEAN NOT NULL DEFAULT TRUE,
  visible_to_funders    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- POPIA requires an auditable consent trail, not just a current-state flag
CREATE TABLE consent_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_text  TEXT NOT NULL,          -- snapshot of the exact consent wording shown at the time
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at  TIMESTAMPTZ
);

CREATE INDEX idx_consent_user ON consent_records (user_id);

-- ---------------------------------------------------------------------
-- Verification module hook (Phase 2/3 of the platform roadmap) —
-- registration only ever writes 'pending' rows here; the verification
-- module (not built yet) is the only writer of 'verified'/'rejected'.
-- ---------------------------------------------------------------------
CREATE TABLE verification_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id    UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  record_type   VARCHAR(20) NOT NULL CHECK (record_type IN ('id', 'qualification', 'reference', 'employment')),
  status        verification_status_type NOT NULL DEFAULT 'pending',
  provider      VARCHAR(80),            -- e.g. accredited DHA vendor name, or 'SAQA VeriSearch'
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_learner ON verification_records (learner_id);

-- ---------------------------------------------------------------------
-- Convenience view: this is what the Employer Search module (built next)
-- will query — one row per learner, pre-joined, respecting visibility.
-- ---------------------------------------------------------------------
CREATE VIEW learner_search_view AS
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
  lvs.visible_to_employers,
  lvs.visible_to_tsps,
  lvs.visible_to_funders,
  (SELECT status FROM verification_records vr WHERE vr.learner_id = lp.id AND vr.record_type = 'id' ORDER BY created_at DESC LIMIT 1) AS id_verification_status,
  (SELECT status FROM verification_records vr WHERE vr.learner_id = lp.id AND vr.record_type = 'qualification' ORDER BY created_at DESC LIMIT 1) AS qualification_verification_status,
  (SELECT array_agg(cf.name) FROM learner_career_interests lci JOIN career_fields cf ON cf.id = lci.field_id WHERE lci.learner_id = lp.id) AS career_interests
FROM learner_profiles lp
JOIN learner_visibility_settings lvs ON lvs.learner_id = lp.id;
