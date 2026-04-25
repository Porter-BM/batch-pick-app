-- ============================================================
-- Batch Pick App — Supabase Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- App-wide settings (single row, id always = 1)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  staff_pin_hash TEXT NOT NULL,
  admin_pin_hash TEXT NOT NULL,
  bin_location_metafield_key TEXT NOT NULL DEFAULT 'custom.bin_name',
  max_batch_size INTEGER NOT NULL DEFAULT 12,
  CONSTRAINT single_row CHECK (id = 1)
);

-- One row per pick walk session
CREATE TABLE IF NOT EXISTS pick_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'parked', 'abandoned')),
  current_bin_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS pick_runs_session_id_idx ON pick_runs(session_id);
CREATE INDEX IF NOT EXISTS pick_runs_status_idx ON pick_runs(status);

-- Orders within a pick run
CREATE TABLE IF NOT EXISTS pick_run_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_run_id UUID NOT NULL REFERENCES pick_runs(id) ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL,
  shopify_order_number TEXT NOT NULL,
  tote_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'picked', 'parked')),
  parked_reason TEXT,
  park_tote_number INTEGER
);

CREATE INDEX IF NOT EXISTS pick_run_orders_run_id_idx ON pick_run_orders(pick_run_id);
CREATE INDEX IF NOT EXISTS pick_run_orders_order_id_idx ON pick_run_orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS pick_run_orders_tote_idx ON pick_run_orders(tote_number);

-- Individual bin stop confirmation log
CREATE TABLE IF NOT EXISTS pick_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_run_id UUID NOT NULL REFERENCES pick_runs(id) ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  bin_location TEXT,
  quantity_confirmed INTEGER NOT NULL,
  confirmed_at TIMESTAMPTZ DEFAULT now(),
  method TEXT NOT NULL
    CHECK (method IN ('scan', 'manual', 'skipped'))
);

CREATE INDEX IF NOT EXISTS pick_confirmations_run_id_idx ON pick_confirmations(pick_run_id);

-- Persistent parked orders across sessions
CREATE TABLE IF NOT EXISTS parked_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id TEXT NOT NULL,
  shopify_order_number TEXT NOT NULL,
  reason TEXT NOT NULL,
  park_tote_number INTEGER,
  parked_at TIMESTAMPTZ DEFAULT now(),
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by_pick_run_id UUID REFERENCES pick_runs(id)
);

CREATE INDEX IF NOT EXISTS parked_orders_order_id_idx ON parked_orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS parked_orders_resolved_idx ON parked_orders(resolved);

-- ============================================================
-- Seed initial settings row
-- IMPORTANT: Replace these hashes with real bcrypt hashes
-- Generate with: node -e "const b=require('bcryptjs'); console.log(b.hashSync('YOUR_PIN', 10))"
-- Default staff PIN: 1234  |  Default admin PIN: 9999
-- CHANGE THESE IMMEDIATELY via /admin after first deploy
-- ============================================================
INSERT INTO settings (id, staff_pin_hash, admin_pin_hash, bin_location_metafield_key, max_batch_size)
VALUES (
  1,
  '$2a$10$placeholder_staff_pin_hash_replace_me',
  '$2a$10$placeholder_admin_pin_hash_replace_me',
  'custom.bin_name',
  12
)
ON CONFLICT (id) DO NOTHING;
