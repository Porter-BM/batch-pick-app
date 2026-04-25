// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = 'staff' | 'admin'

export interface SessionPayload {
  session_id: string
  role: UserRole
  user_id: string
  user_name: string
  created_at: number
  last_active_at: number
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface AppSettings {
  id: number
  bin_location_metafield_key: string
  max_batch_size: number
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type OrderTab = 'nz' | 'international' | 'pickups'

export interface ShopifyOrder {
  id: string
  name: string // e.g. "#1042"
  orderNumber: number
  createdAt: string
  shippingAddress: {
    country: string
    countryCode: string
    province: string
  } | null
  lineItems: LineItem[]
  fulfillmentStatus: string
  deliveryMethod?: string
  tags: string[]
}

export interface LineItem {
  id: string
  title: string
  quantity: number
  variant: {
    id: string
    title: string
    barcode: string | null
    binLocation: string | null
  } | null
}

export interface OrderWithStatus extends ShopifyOrder {
  pickStatus: 'available' | 'in_progress' | 'parked'
  parkReason?: string
  parkToteNumber?: number
}

// ─── Pick Runs ───────────────────────────────────────────────────────────────

export type PickRunStatus = 'active' | 'completed' | 'parked' | 'abandoned'
export type OrderPickStatus = 'pending' | 'picked' | 'parked'
export type ConfirmationMethod = 'scan' | 'manual' | 'skipped' | 'missing'

export interface PickRun {
  id: string
  session_id: string
  created_at: string
  status: PickRunStatus
  current_bin_index: number
}

export interface PickRunOrder {
  id: string
  pick_run_id: string
  shopify_order_id: string
  shopify_order_number: string
  tote_number: number
  status: OrderPickStatus
  parked_reason: string | null
  park_tote_number: number | null
}

export interface PickConfirmation {
  id: string
  pick_run_id: string
  shopify_order_id: string
  variant_id: string
  bin_location: string | null
  quantity_confirmed: number
  confirmed_at: string
  method: ConfirmationMethod
}

export interface ParkedOrder {
  id: string
  shopify_order_id: string
  shopify_order_number: string
  reason: string
  park_tote_number: number | null
  parked_at: string
  resolved: boolean
  resolved_at: string | null
  resolved_by_pick_run_id: string | null
}

// ─── Pick Walk ───────────────────────────────────────────────────────────────

export interface ToteAssignment {
  toteNumber: number
  orderId: string
  orderNumber: string
}

export interface BinStop {
  binLocation: string | null // null = no bin assigned
  variantId: string
  productTitle: string
  variantTitle: string
  barcode: string | null
  totalQuantity: number
  toteBreakdown: { toteNumber: number; quantity: number }[]
  confirmed: boolean
  skipped: boolean
  missingTotes: number[] // tote numbers where items are missing at this stop
}

export interface PickWalkState {
  pickRunId: string
  binStops: BinStop[]
  currentIndex: number
  toteAssignments: ToteAssignment[]
  pendingParkOrders: string[] // order IDs flagged during walk
}
