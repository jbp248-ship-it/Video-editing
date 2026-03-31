import { prisma } from "./db";

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
  const inventory = await prisma.inventory.findUniqueOrThrow({
    where: { id: inventoryId },
    include: { event: true },
  });

  const previousStatus = inventory.status;

  await prisma.inventory.update({
    where: { id: inventoryId },
    data: { status: "PENDING_REMOVAL" },
  });

  const otherPlatformListings = getOtherPlatforms(
    sellingPlatform,
    inventory.listPlatform
  );

  const alert = await prisma.alert.create({
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
  };
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
  ];

  return allPlatforms.filter(
    (p) => p !== sellingPlatform && p !== currentListPlatform
  );
}
