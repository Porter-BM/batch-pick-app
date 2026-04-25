-- ============================================================
-- Batch Pick App — Schema Migration v3
-- Adds multi-user PIN authentication
-- Run this in the Supabase SQL Editor
-- ============================================================

-- ── 1. users table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'admin')),
  pin_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS users_active_idx ON users(active);

-- ── 2. Migrate existing PINs from settings ───────────────────
-- Insert the existing staff and admin PIN hashes from settings
-- as the first two users. Names are placeholders — update via
-- admin screen after deployment.

INSERT INTO users (name, role, pin_hash, active)
SELECT 'Staff', 'staff', staff_pin_hash, true
FROM settings
WHERE id = (SELECT id FROM settings LIMIT 1)
ON CONFLICT DO NOTHING;

INSERT INTO users (name, role, pin_hash, active)
SELECT 'Admin', 'admin', admin_pin_hash, true
FROM settings
WHERE id = (SELECT id FROM settings LIMIT 1)
ON CONFLICT DO NOTHING;

-- ── 3. Add user reference to pick_runs ───────────────────────
ALTER TABLE pick_runs
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS pick_runs_user_idx ON pick_runs(created_by_user_id);

-- ── 4. Add user reference to parked_orders ───────────────────
ALTER TABLE parked_orders
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);

-- ── 5. Helper function: updated_at trigger ───────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- After running this migration:
-- 1. Deploy v28 of the app
-- 2. Log into admin settings
-- 3. Update the default user names from 'Staff' and 'Admin'
--    to real names, and add additional pickers
-- ============================================================
