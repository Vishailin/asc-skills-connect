-- =====================================================================
-- ASC Skills Connect — Admin user management
-- Builds on schema.sql + 002..008 (must be run first, in order)
-- =====================================================================

-- Closes the gap flagged when the admin console first shipped:
-- "Admin user management is read-only... no suspend/deactivate action,
-- since the schema has no status column for it yet."
ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended'));
ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;
