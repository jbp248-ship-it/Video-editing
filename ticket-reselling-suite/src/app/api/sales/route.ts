import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { calculateProfit } from "@/lib/fees";
import { lockInventoryOnSale } from "@/lib/locking";
import { z } from "zod";

// ─── GET /api/sales ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const inventoryId = searchParams.get("inventoryId");
    const platform = searchParams.get("platform");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 1), 1000);

    const where: Record<string, unknown> = {};
    if (inventoryId) where.inventoryId = inventoryId;
    if (platform) where.platform = platform;

    const sales = await prisma.sale.findMany({
      where,
      include: { inventory: { include: { event: true } } },
      orderBy: { saleDate: "desc" },
      take: limit,
    });

    return NextResponse.json(sales);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── POST /api/sales ─────────────────────────────────────────────────────────
// Records a sale. Triggers the locking mechanism and calculates profit.

const CreateSaleSchema = z.object({
  inventoryId: z.string(),
  platform: z.enum(["STUBHUB", "TICKETMASTER", "VIVID_SEATS", "SEATGEEK", "ETIX", "AXS", "TICKPICK", "GAMETIME", "OTHER"]),
  salePrice: z.number().positive(),
  quantitySold: z.number().int().positive().default(1),
  source: z.string().default("MANUAL"),
  rawEmailData: z.string().optional(),
  feeOverrides: z
    .object({
      sellerFeePercent: z.number().optional(),
      processingFeePercent: z.number().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = CreateSaleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // 1. LOCK first — prevent double-sells
    // The lock transaction also returns the inventory snapshot for cost basis,
    // ensuring the price we use is from the same atomic read as the status check.
    let lockResult;
    try {
      lockResult = await lockInventoryOnSale(
        data.inventoryId,
        data.platform
      );
    } catch {
      return NextResponse.json(
        { error: "Inventory not found" },
        { status: 404 }
      );
    }

    if (lockResult.alreadyLocked || !lockResult.inventory) {
      return NextResponse.json(
        {
          error: "This inventory item is already locked or sold",
          previousStatus: lockResult.previousStatus,
        },
        { status: 409 }
      );
    }

    // 2. Load persisted fee setting for this platform (falls back to hardcoded default)
    const feeKey = `fee_${data.platform}`;
    const feeSetting = await prisma.setting.findUnique({ where: { key: feeKey } }).catch(() => null);
    const persistedFeePercent = feeSetting ? parseFloat(feeSetting.value) : undefined;
    const resolvedFeeOverrides = {
      ...data.feeOverrides,
      // Only override if we have a valid persisted value and caller didn't supply one
      ...(persistedFeePercent != null && !isNaN(persistedFeePercent) && !data.feeOverrides?.sellerFeePercent
        ? { sellerFeePercent: persistedFeePercent }
        : {}),
    };

    // 3. Calculate profit using the transactionally-consistent inventory data
    const profit = calculateProfit(
      data.platform,
      data.salePrice,
      data.quantitySold,
      lockResult.inventory.purchasePrice,
      lockResult.inventory.quantity,
      resolvedFeeOverrides
    );

    // 3. Create sale record
    const sale = await prisma.sale.create({
      data: {
        inventoryId: data.inventoryId,
        platform: data.platform,
        salePrice: data.salePrice,
        quantitySold: data.quantitySold,
        platformFee: profit.platformFee,
        processingFee: profit.processingFee,
        netRevenue: profit.netRevenue,
        netProfit: profit.netProfit,
        source: data.source,
        rawEmailData: data.rawEmailData,
      },
      include: { inventory: { include: { event: true } } },
    });

    return NextResponse.json(
      {
        sale,
        lockResult,
        profitBreakdown: profit,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
