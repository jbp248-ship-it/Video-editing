import { NextRequest, NextResponse } from "next/server";
import { parseEmail } from "@/lib/email-parser";
import { prisma } from "@/lib/db";
import { lockInventoryOnSale } from "@/lib/locking";
import { calculateProfit } from "@/lib/fees";

/**
 * POST /api/webhooks/email
 *
 * Receives inbound email webhooks from Postmark.
 * Postmark sends parsed email data as JSON when a sale confirmation
 * is forwarded to your designated inbound email address.
 *
 * Setup:
 * 1. Create a Postmark inbound server
 * 2. Set the webhook URL to: https://yourdomain.com/api/webhooks/email
 * 3. Forward all platform sale emails to your Postmark inbound address
 */

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Postmark inbound webhook format
  const from = body.FromFull?.Email ?? body.From ?? "";
  const subject = body.Subject ?? "";
  const textBody = body.TextBody ?? "";
  const htmlBody = body.HtmlBody ?? "";

  // Parse the email
  const parsed = parseEmail(from, subject, textBody, htmlBody);

  if (!parsed) {
    // Not a recognized sale email — log and ignore
    return NextResponse.json({ status: "ignored", reason: "no_match" });
  }

  // Try to match to inventory by event name + section + row
  const matchedInventory = await prisma.inventory.findFirst({
    where: {
      status: "LISTED",
      section: parsed.section ? { equals: parsed.section, mode: "insensitive" } : undefined,
      row: parsed.row ? { equals: parsed.row, mode: "insensitive" } : undefined,
      event: {
        name: { contains: parsed.eventName, mode: "insensitive" },
      },
    },
    include: { event: true },
  });

  if (!matchedInventory) {
    // Could not match to inventory — create an alert for manual review
    await prisma.alert.create({
      data: {
        type: "DOUBLE_SELL_RISK",
        title: `Unmatched Sale: ${parsed.eventName}`,
        message:
          `Detected sale on ${parsed.platform} for $${parsed.salePrice} ` +
          `(${parsed.section ?? "?"} / ${parsed.row ?? "?"}). ` +
          `Could not auto-match to inventory. Please review manually.`,
      },
    });

    return NextResponse.json({
      status: "alert_created",
      reason: "no_inventory_match",
      parsed,
    });
  }

  // Lock inventory immediately (double-sell prevention)
  const lockResult = await lockInventoryOnSale(
    matchedInventory.id,
    parsed.platform
  );

  // Calculate profit
  const profit = calculateProfit(
    parsed.platform,
    parsed.salePrice,
    parsed.quantity,
    Number(matchedInventory.purchasePrice),
    matchedInventory.quantity
  );

  // Create sale record
  const sale = await prisma.sale.create({
    data: {
      inventoryId: matchedInventory.id,
      platform: parsed.platform as never,
      salePrice: parsed.salePrice,
      quantitySold: parsed.quantity,
      platformFee: profit.platformFee,
      processingFee: profit.processingFee,
      netRevenue: profit.netRevenue,
      netProfit: profit.netProfit,
      source: "EMAIL_PARSED",
      rawEmailData: parsed.rawText.substring(0, 5000), // Trim for storage
      confirmed: false, // Requires manual confirmation
    },
  });

  return NextResponse.json({
    status: "sale_recorded",
    saleId: sale.id,
    lockResult,
    profit,
    confidence: parsed.confidence,
  });
}
