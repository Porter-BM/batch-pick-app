-- ============================================================
-- Batch Pick App — Schema Migration v2
-- Adds per-line-item missing item tracking and parked order detail
-- Run this in the Supabase SQL Editor AFTER the original schema
-- ============================================================

-- ── 1. pick_confirmations ─────────────────────────────────────
-- Add tote_number so we know which tote was affected per confirmation
-- Add quantity_missing to record how many couldn't be picked
-- Add supervisor_reason for can't pick events at line item level
-- Change method to include 'missing' as a valid value

ALTER TABLE pick_confirmations
  ADD COLUMN IF NOT EXISTS tote_number INTEGER,
  ADD COLUMN IF NOT EXISTS quantity_missing INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supervisor_reason TEXT,
  ADD COLUMN IF NOT EXISTS supervisor_session_id TEXT;

-- Drop and recreate the method check constraint to include 'missing'
ALTER TABLE pick_confirmations DROP CONSTRAINT IF EXISTS pick_confirmations_method_check;
ALTER TABLE pick_confirmations
  ADD CONSTRAINT pick_confirmations_method_check
  CHECK (method IN ('scan', 'manual', 'skipped', 'missing'));

-- ── 2. pick_run_orders ────────────────────────────────────────
-- Add is_partially_picked flag so pick complete can split orders
-- Add picked_line_items and missing_line_items as JSONB arrays
-- for storing line item detail at the order level

ALTER TABLE pick_run_orders
  ADD COLUMN IF NOT EXISTS is_partially_picked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS picked_line_items JSONB,
  ADD COLUMN IF NOT EXISTS missing_line_items JSONB;

-- ── 3. parked_orders ─────────────────────────────────────────
-- Extend with full line item detail so the parked orders screen
-- can show exactly what's in the tote vs what's still missing
-- Add origin pick run for traceability

ALTER TABLE parked_orders
  ADD COLUMN IF NOT EXISTS origin_pick_run_id UUID REFERENCES pick_runs(id),
  ADD COLUMN IF NOT EXISTS picked_line_items JSONB,
  ADD COLUMN IF NOT EXISTS missing_line_items JSONB,
  ADD COLUMN IF NOT EXISTS resume_pick_run_id UUID REFERENCES pick_runs(id),
  ADD COLUMN IF NOT EXISTS resume_started_at TIMESTAMPTZ;

-- ── 4. New table: parked_tote_assignments ─────────────────────
-- Links a parked order to a physical park tote number
-- Separate from pick_run_orders.park_tote_number so we can
-- track the tote across resume pick walks

CREATE TABLE IF NOT EXISTS parked_tote_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parked_order_id UUID NOT NULL REFERENCES parked_orders(id) ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL,
  shopify_order_number TEXT NOT NULL,
  park_tote_number INTEGER NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by_session_id TEXT,
  released_at TIMESTAMPTZ,
  released_by_pick_run_id UUID REFERENCES pick_runs(id)
);

CREATE INDEX IF NOT EXISTS parked_tote_assignments_order_id_idx ON parked_tote_assignments(shopify_order_id);
CREATE INDEX IF NOT EXISTS parked_tote_assignments_parked_order_id_idx ON parked_tote_assignments(parked_order_id);
CREATE INDEX IF NOT EXISTS parked_tote_assignments_tote_number_idx ON parked_tote_assignments(park_tote_number);

-- ── 5. New table: resume_pick_runs ────────────────────────────
-- Tracks mini pick walks for resolving parked orders
-- Links back to the original parked order and the new pick run

CREATE TABLE IF NOT EXISTS resume_pick_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parked_order_id UUID NOT NULL REFERENCES parked_orders(id) ON DELETE CASCADE,
  pick_run_id UUID NOT NULL REFERENCES pick_runs(id) ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS resume_pick_runs_parked_order_idx ON resume_pick_runs(parked_order_id);
CREATE INDEX IF NOT EXISTS resume_pick_runs_pick_run_idx ON resume_pick_runs(pick_run_id);

-- ── 6. View: parked_orders_with_totes ─────────────────────────
-- Convenience view for the parked orders screen API

CREATE OR REPLACE VIEW parked_orders_with_totes AS
SELECT
  po.id,
  po.shopify_order_id,
  po.shopify_order_number,
  po.reason,
  po.parked_at,
  po.resolved,
  po.resolved_at,
  po.picked_line_items,
  po.missing_line_items,
  po.origin_pick_run_id,
  po.resume_pick_run_id,
  po.resume_started_at,
  pta.park_tote_number,
  pta.assigned_at AS tote_assigned_at
FROM parked_orders po
LEFT JOIN parked_tote_assignments pta ON pta.parked_order_id = po.id AND pta.released_at IS NULL
WHERE po.resolved = false
ORDER BY po.parked_at DESC;

-- ============================================================
-- JSONB line item format reference (for app code)
-- picked_line_items / missing_line_items structure:
-- [
--   {
--     "variant_id": "gid://shopify/ProductVariant/123",
--     "product_title": "Pastel Cloth Wipes",
--     "variant_title": "Pack of Five",
--     "bin_location": "A01-02-02",
--     "quantity": 2,
--     "tote_number": 3
--   }
-- ]
-- ============================================================
