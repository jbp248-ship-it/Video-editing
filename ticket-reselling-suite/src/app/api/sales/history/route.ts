import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// ─── GET /api/sales/history ──────────────────────────────────────────────────
// Returns all sales with related inventory/event data and computed profit/ROI.
// Query params: ?days=90

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    let days = parseInt(searchParams.get("days") ?? "90", 10);
    if (isNaN(days) || days < 1 || days > 365) days = 90;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const sales = await prisma.sale.findMany({
      where: {
        saleDate: { gte: since },
      },
      include: {
        inventory: {
          include: { event: true },
        },
      },
      orderBy: { saleDate: "desc" },
    });

    const result = sales
      .map((sale: any) => {
        if (!sale.inventory?.event) return null;

        const costBasis = sale.inventory.purchasePrice * sale.quantitySold;
        const roi = costBasis > 0 ? (sale.netProfit / costBasis) * 100 : 0;

        return {
          id: sale.id,
          saleDate: sale.saleDate,
          platform: sale.platform,
          salePrice: sale.salePrice,
          quantitySold: sale.quantitySold,
          netRevenue: sale.netRevenue,
          platformFee: sale.platformFee,
          processingFee: sale.processingFee,
          inventory: {
            id: sale.inventory.id,
            section: sale.inventory.section,
            row: sale.inventory.row,
            purchasePrice: sale.inventory.purchasePrice,
            event: {
              name: sale.inventory.event.name,
              date: sale.inventory.event.eventDate,
              venue: sale.inventory.event.venue,
            },
          },
          profit: sale.netProfit,
          roi: Math.round(roi * 100) / 100,
        };
      })
      .filter(Boolean);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
