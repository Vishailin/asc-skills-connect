-- =====================================================================
-- ASC Skills Connect — Placement notes
-- Builds on schema.sql + 002..009 (must be run first, in order)
-- =====================================================================

-- General-purpose, not status-specific — useful context at creation
-- ("started via referral from Ubuntu Skills Academy"), while active
-- ("employer reports strong performance"), or as the reason when the
-- placement ends ("did not report for duty after week 2"). Same pattern
-- as verification_records.review_notes.
ALTER TABLE placements ADD COLUMN notes TEXT;
