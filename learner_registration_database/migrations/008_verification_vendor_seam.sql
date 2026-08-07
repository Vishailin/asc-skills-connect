-- =====================================================================
-- ASC Skills Connect — Verification vendor integration seam
-- Builds on 001_schema.sql + 002..007 (must be run first, in order)
-- =====================================================================

-- Lets employer-api/verifier.js's automated pre-check (SA ID checksum
-- validation, or the SAQA-stub's "not integrated" note) persist its
-- reasoning somewhere an admin reviewer can see it, instead of it being
-- lost the moment the API response is returned.
ALTER TABLE verification_records ADD COLUMN review_notes TEXT;
