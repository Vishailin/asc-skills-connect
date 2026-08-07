-- =====================================================================
-- ASC Skills Connect — Notification delivery tracking
-- Builds on 001_schema.sql + 002..006 (must be run first, in order)
-- =====================================================================

-- The notifications table (006_matching_job.sql) only ever recorded that
-- a match happened — nothing about whether it was actually sent anywhere.
-- This adds what a real Notification Service (spec 2.1 — still not
-- built; see employer-api/notifier.js for the pluggable stand-in) needs
-- to report back.
ALTER TABLE notifications ADD COLUMN channel VARCHAR(20) NOT NULL DEFAULT 'email'
  CHECK (channel IN ('email', 'sms', 'whatsapp', 'push', 'in_app'));
ALTER TABLE notifications ADD COLUMN delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending'
  CHECK (delivery_status IN ('pending', 'delivered', 'failed'));
ALTER TABLE notifications ADD COLUMN delivered_at TIMESTAMPTZ;
