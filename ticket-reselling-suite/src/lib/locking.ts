import { prisma } from "./db";
import { TicketStatus, AlertType } from "@prisma/client";

/**
 * Double-Sell Prevention: Locking Mechanism
 *
 * When a sale is detected (via email parse, webhook, or manual entry):
 * 1. Mark the inventory item as PENDING_REMOVAL
 * 2. Create a DOUBLE_SELL_RISK alert
 * 3. Return affected listings on other platforms for immediate de-listing
 *
 * This is the FIRST thing that runs when any sale signal is received,
 * before profit calculations or confirmation.
 */

export interface LockResult {
  inventoryId: string;
  previousStatus: string;
  otherPlatformListings: string[];
  alertId: string;
}

/**
 * Lock an inventory item after a sale is detected.
 * Immediately flags it as PENDING_REMOVAL and fires an alert.
 */
export async function lockInventoryOnSale(
  inventoryId: string,
  sellingPlatform: string
): Promise<LockResult> {
  // Fetch current inventory state
  const inventory = await prisma.inventory.findUniqueOrThrow({
    where: { id: inventoryId },
    include: { event: true },
  });

  const previousStatus = inventory.status;

  // 1. Immediately mark as PENDING_REMOVAL
  await prisma.inventory.update({
    where: { id: inventoryId },
    data: { status: TicketStatus.PENDING_REMOVAL },
  });

  // 2. Determine which other platforms might have this listed
  const otherPlatformListings = getOtherPlatforms(
    sellingPlatform,
    inventory.listPlatform
  );

  // 3. Create urgent alert
  const alert = await prisma.alert.create({
    data: {
      type: AlertType.DOUBLE_SELL_RISK,
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
  };
}

/**
 * Confirm the sale went through. Transitions from PENDING_REMOVAL to SOLD.
 */
export async function confirmSale(inventoryId: string): Promise<void> {
  await prisma.inventory.update({
    where: { id: inventoryId },
    data: { status: TicketStatus.SOLD },
  });
}

/**
 * Cancel a false-positive sale detection. Restores to LISTED.
 */
export async function cancelLock(inventoryId: string): Promise<void> {
  await prisma.inventory.update({
    where: { id: inventoryId },
    data: { status: TicketStatus.LISTED },
  });
}

/**
 * Determine other platforms where the ticket might be listed.
 */
function getOtherPlatforms(
  sellingPlatform: string,
  currentListPlatform: string | null
): string[] {
  const allPlatforms = [
    "STUBHUB",
    "TICKETMASTER",
    "VIVID_SEATS",
    "SEATGEEK",
  ];

  return allPlatforms.filter(
    (p) => p !== sellingPlatform && p !== currentListPlatform
  );
}
