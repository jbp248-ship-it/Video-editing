// Re-export Prisma types for convenience
export type {
  Event,
  Inventory,
  Sale,
  MarketSnapshot,
  Alert,
} from "@prisma/client";

export {
  Platform,
  TicketStatus,
  SaleSource,
  SnapshotGranularity,
  AlertType,
} from "@prisma/client";

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
  costBasis: number;       // purchasePrice / quantity
  marketPrice: number | null; // latest get-in price from snapshots
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
