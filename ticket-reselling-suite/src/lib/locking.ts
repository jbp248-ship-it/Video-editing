import { prisma } from "./db";

/**
 * Double-Sell Prevention: Locking Mechanism
 *
 * When a sale is detected (via email parse, webhook, or manual entry):
 * 1. Atomically mark the inventory item as PENDING_REMOVAL (only if still LISTED)
 * 2. Create a DOUBLE_SELL_RISK alert
 * 3. Return affected listings on other platforms for immediate de-listing
 *
 * Uses a transaction with a status guard to prevent race conditions
 * where two simultaneous sale signals could both lock the same item.
 */

export interface LockResult {
  inventoryId: string;
  previousStatus: string;
  otherPlatformListings: string[];
  alertId: string;
  alreadyLocked: boolean;
  /** The inventory snapshot read inside the transaction — use for cost basis */
  inventory: {
    purchasePrice: number;
    quantity: number;
  } | null;
}

/**
 * Lock an inventory item after a sale is detected.
 * Atomically checks status and transitions to PENDING_REMOVAL.
 * Returns { alreadyLocked: true } if another sale already claimed it.
 */
export async function lockInventoryOnSale(
  inventoryId: string,
  sellingPlatform: string
): Promise<LockResult> {
  return prisma.$transaction(async (tx) => {
    // Fetch with implicit row-level lock inside the transaction
    const inventory = await tx.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      include: { event: true },
    });

    const previousStatus = inventory.status;

    // Guard: only lock if the ticket is still in a lockable state
    if (
      inventory.status === "PENDING_REMOVAL" ||
      inventory.status === "SOLD" ||
      inventory.status === "TRANSFERRED"
    ) {
      return {
        inventoryId,
        previousStatus,
        otherPlatformListings: [],
        alertId: "",
        alreadyLocked: true,
        inventory: null,
      };
    }

    // Atomically update — the WHERE ensures no race condition
    const updated = await tx.inventory.updateMany({
      where: {
        id: inventoryId,
        status: { notIn: ["PENDING_REMOVAL", "SOLD", "TRANSFERRED"] },
      },
      data: { status: "PENDING_REMOVAL" },
    });

    // If no rows were updated, another transaction beat us
    if (updated.count === 0) {
      return {
        inventoryId,
        previousStatus,
        otherPlatformListings: [],
        alertId: "",
        alreadyLocked: true,
        inventory: null,
      };
    }

    const otherPlatformListings = getOtherPlatforms(
      sellingPlatform,
      inventory.listPlatform
    );

    const alert = await tx.alert.create({
      data: {
        type: "DOUBLE_SELL_RISK",
        title: `URGENT: De-list ${inventory.event.name}`,
        message:
          `Sold on ${sellingPlatform}: ${inventory.section} Row ${inventory.row}, ` +
          `Seats ${inventory.seatFrom}-${inventory.seatTo}. ` +
          `Immediately remove from: ${otherPlatformListings.join(", ") || "N/A"}.`,
        eventId: inventory.eventId,
        inventoryId: inventoryId,
      },
    });

    return {
      inventoryId,
      previousStatus,
      otherPlatformListings,
      alertId: alert.id,
      alreadyLocked: false,
      inventory: {
        purchasePrice: inventory.purchasePrice,
        quantity: inventory.quantity,
      },
    };
  });
}

export async function confirmSale(inventoryId: string): Promise<void> {
  await prisma.inventory.update({
    where: { id: inventoryId },
    data: { status: "SOLD" },
  });
}

export async function cancelLock(inventoryId: string): Promise<void> {
  await prisma.inventory.update({
    where: { id: inventoryId },
    data: { status: "LISTED" },
  });
}

function getOtherPlatforms(
  sellingPlatform: string,
  currentListPlatform: string | null
): string[] {
  const allPlatforms = [
    "STUBHUB",
    "TICKETMASTER",
    "VIVID_SEATS",
    "SEATGEEK",
    "ETIX",
  ];

  return allPlatforms.filter(
    (p) => p !== sellingPlatform && p !== currentListPlatform
  );
}
