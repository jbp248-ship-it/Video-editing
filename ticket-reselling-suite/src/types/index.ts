// Re-export Prisma types for convenience
export type {
  Event,
  Inventory,
  Sale,
  MarketSnapshot,
  Alert,
} from "@prisma/client";

// ─── String constants (SQLite doesn't support enums) ─────────────────────────

export const Platform = {
  STUBHUB: "STUBHUB",
  TICKETMASTER: "TICKETMASTER",
  VIVID_SEATS: "VIVID_SEATS",
  SEATGEEK: "SEATGEEK",
  OTHER: "OTHER",
} as const;

export const TicketStatus = {
  IN_HAND: "IN_HAND",
  LISTED: "LISTED",
  PENDING_SALE: "PENDING_SALE",
  SOLD: "SOLD",
  PENDING_REMOVAL: "PENDING_REMOVAL",
  TRANSFERRED: "TRANSFERRED",
  EXPIRED: "EXPIRED",
} as const;

export const SaleSource = {
  MANUAL: "MANUAL",
  EMAIL_PARSED: "EMAIL_PARSED",
  WEBHOOK: "WEBHOOK",
  EXTENSION: "EXTENSION",
} as const;

export const AlertType = {
  LOW_INVENTORY: "LOW_INVENTORY",
  HIGH_MARGIN: "HIGH_MARGIN",
  PRICE_DROP: "PRICE_DROP",
  DOUBLE_SELL_RISK: "DOUBLE_SELL_RISK",
  APPROACHING_EVENT: "APPROACHING_EVENT",
} as const;

// ─── Dashboard View Types ────────────────────────────────────────────────────

export interface InventoryWithEvent {
  id: string;
  section: string;
  row: string;
  seatFrom: number;
  seatTo: number;
  quantity: number;
  purchasePrice: number;
  listPrice: number | null;
  listPlatform: string | null;
  status: string;
  event: {
    id: string;
    name: string;
    venue: string;
    eventDate: string;
  };
  costBasis: number;
  marketPrice: number | null;
  potentialProfit: number | null;
  marginPercent: number | null;
}

export interface DashboardStats {
  totalInventoryValue: number;
  totalListedValue: number;
  totalSalesRevenue: number;
  totalProfit: number;
  activeListings: number;
  pendingRemovals: number;
  eventsTracked: number;
  avgMarginPercent: number;
}

export interface PriceTrend {
  timestamp: string;
  getInPrice: number;
  medianPrice: number | null;
  totalListings: number;
}

export interface AlertSummary {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

// ─── Fee Calculation Types ───────────────────────────────────────────────────

export interface FeeSchedule {
  platform: string;
  sellerFeePercent: number;
  processingFeeFlat: number;
  processingFeePercent: number;
  notes: string;
}

export interface ProfitCalculation {
  grossRevenue: number;
  platformFee: number;
  processingFee: number;
  netRevenue: number;
  costBasis: number;
  netProfit: number;
  marginPercent: number;
}
