import type { FeeSchedule, ProfitCalculation } from "@/types";

// ─── Platform Fee Schedules ──────────────────────────────────────────────────
// Centralized fee config — update these when platforms change their rates.

const FEE_SCHEDULES: Record<string, FeeSchedule> = {
  STUBHUB: {
    platform: "StubHub",
    sellerFeePercent: 15.0,
    processingFeeFlat: 0,
    processingFeePercent: 0,
    notes: "Standard 15%. High-volume sellers may negotiate lower.",
  },
  TICKETMASTER: {
    platform: "Ticketmaster",
    sellerFeePercent: 12.0,
    processingFeeFlat: 0,
    processingFeePercent: 3.0, // Seller processing fee
    notes: "10-15% seller fee + ~3% processing. Using 12% + 3% as baseline.",
  },
  VIVID_SEATS: {
    platform: "Vivid Seats",
    sellerFeePercent: 10.0,
    processingFeeFlat: 0,
    processingFeePercent: 0,
    notes: "Standard 10%. Lower than competitors but requires higher volume.",
  },
  SEATGEEK: {
    platform: "SeatGeek",
    sellerFeePercent: 12.0,
    processingFeeFlat: 0,
    processingFeePercent: 0,
    notes: "~12% seller fee. Variable based on event/category.",
  },
  ETIX: {
    platform: "Etix",
    sellerFeePercent: 10.0,
    processingFeeFlat: 0,
    processingFeePercent: 2.0,
    notes: "~10% seller fee + ~2% processing. Varies by venue contract.",
  },
  OTHER: {
    platform: "Other",
    sellerFeePercent: 15.0,
    processingFeeFlat: 0,
    processingFeePercent: 0,
    notes: "Default conservative estimate.",
  },
};

/**
 * Get the fee schedule for a platform. Falls back to OTHER if unknown.
 */
export function getFeeSchedule(platform: string): FeeSchedule {
  return FEE_SCHEDULES[platform] ?? FEE_SCHEDULES.OTHER;
}

/**
 * Get all fee schedules (for display in settings/dashboard).
 */
export function getAllFeeSchedules(): FeeSchedule[] {
  return Object.values(FEE_SCHEDULES);
}

/**
 * Calculate net profit for a sale.
 *
 * @param platform       - The selling platform (e.g., "STUBHUB")
 * @param salePricePerTicket - Gross sale price per ticket
 * @param quantity       - Number of tickets sold
 * @param totalPurchaseCost - Total cost paid for the entire inventory lot
 * @param totalLotQuantity  - Total tickets in the lot (for cost-basis calc)
 * @param feeOverrides   - Optional overrides for fee percentages
 */
export function calculateProfit(
  platform: string,
  salePricePerTicket: number,
  quantity: number,
  totalPurchaseCost: number,
  totalLotQuantity: number,
  feeOverrides?: { sellerFeePercent?: number; processingFeePercent?: number }
): ProfitCalculation {
  const schedule = getFeeSchedule(platform);

  const sellerFeePct =
    feeOverrides?.sellerFeePercent ?? schedule.sellerFeePercent;
  const processingFeePct =
    feeOverrides?.processingFeePercent ?? schedule.processingFeePercent;

  const grossRevenue = salePricePerTicket * quantity;
  const platformFee = roundCents(grossRevenue * (sellerFeePct / 100));
  const processingFee = roundCents(
    grossRevenue * (processingFeePct / 100) +
      schedule.processingFeeFlat * quantity
  );
  const netRevenue = roundCents(grossRevenue - platformFee - processingFee);

  const costBasis = roundCents(
    (totalPurchaseCost / totalLotQuantity) * quantity
  );
  const netProfit = roundCents(netRevenue - costBasis);
  const marginPercent =
    costBasis > 0 ? roundCents((netProfit / costBasis) * 100) : 0;

  return {
    grossRevenue,
    platformFee,
    processingFee,
    netRevenue,
    costBasis,
    netProfit,
    marginPercent,
  };
}

/**
 * Quick estimate: given a list price, what would your net profit be?
 * Useful for the dashboard "potential profit" column.
 */
export function estimateProfit(
  platform: string,
  listPricePerTicket: number,
  quantity: number,
  totalPurchaseCost: number,
  totalLotQuantity: number
): ProfitCalculation {
  return calculateProfit(
    platform,
    listPricePerTicket,
    quantity,
    totalPurchaseCost,
    totalLotQuantity
  );
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}
