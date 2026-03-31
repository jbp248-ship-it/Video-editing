import { NextRequest, NextResponse } from "next/server";
import { parseEmail } from "@/lib/email-parser";
import { prisma } from "@/lib/db";
import { lockInventoryOnSale } from "@/lib/locking";
import { calculateProfit } from "@/lib/fees";
import { verifyWebhookSecret } from "@/lib/auth";

/**
 * POST /api/webhooks/email?token=YOUR_WEBHOOK_SECRET
 *
 * Receives inbound email webhooks from Postmark.
 * Postmark sends parsed email data as JSON when a sale confirmation
 * is forwarded to your designated inbound email address.
 *
 * Setup:
 * 1. Create a Postmark inbound server
 * 2. Set the webhook URL to: https://yourdomain.com/api/webhooks/email?token=YOUR_SECRET
 * 3. Forward all platform sale emails to your Postmark inbound address
 */

export async function POST(req: NextRequest) {
  // Verify webhook authenticity
  const authError = verifyWebhookSecret(req);
  if (authError) return authError;

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
      section: parsed.section ? { equals: parsed.section } : undefined,
      row: parsed.row ? { equals: parsed.row } : undefined,
      event: {
        name: { contains: parsed.eventName },
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

  // If already locked by another concurrent sale, skip creating a duplicate
  if (lockResult.alreadyLocked) {
    return NextResponse.json({
      status: "already_locked",
      inventoryId: matchedInventory.id,
      message: "This inventory item was already locked by another sale signal.",
    });
  }

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
      platform: parsed.platform,
      salePrice: parsed.salePrice,
      quantitySold: parsed.quantity,
      platformFee: profit.platformFee,
      processingFee: profit.processingFee,
      netRevenue: profit.netRevenue,
      netProfit: profit.netProfit,
      source: "EMAIL_PARSED",
      rawEmailData: parsed.rawText.substring(0, 5000),
      confirmed: false,
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
