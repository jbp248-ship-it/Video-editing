import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// ─── GET /api/dashboard ──────────────────────────────────────────────────────
// Aggregated stats for the main dashboard view.

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const [inventoryStats, salesStats, alertCount, eventCount] =
      await Promise.all([
        // Inventory aggregations
        prisma.inventory.groupBy({
          by: ["status"],
          _sum: { purchasePrice: true, listPrice: true },
          _count: true,
        }),

        // Sales aggregations
        prisma.sale.aggregate({
          _sum: { netRevenue: true, netProfit: true },
          _count: true,
        }),

        // Unread alert count
        prisma.alert.count({
          where: { dismissed: false, read: false },
        }),

        // Events tracked
        prisma.event.count(),
      ]);

    // Compute summary stats
    let totalInventoryValue = 0;
    let totalListedValue = 0;
    let activeListings = 0;
    let pendingRemovals = 0;

    for (const group of inventoryStats) {
      const purchaseSum = Number(group._sum.purchasePrice ?? 0);
      const listSum = Number(group._sum.listPrice ?? 0);

      totalInventoryValue += purchaseSum;

      if (group.status === "LISTED") {
        totalListedValue += listSum; // _sum already aggregates across the group
        activeListings += group._count;
      }
      if (group.status === "PENDING_REMOVAL") {
        pendingRemovals += group._count;
      }
    }

    const totalSalesRevenue = Number(salesStats._sum.netRevenue ?? 0);
    const totalProfit = Number(salesStats._sum.netProfit ?? 0);
    const avgMarginPercent =
      totalInventoryValue > 0
        ? Math.round((totalProfit / totalInventoryValue) * 10000) / 100
        : 0;

    return NextResponse.json({
      totalInventoryValue,
      totalListedValue,
      totalSalesRevenue,
      totalProfit,
      activeListings,
      pendingRemovals,
      eventsTracked: eventCount,
      avgMarginPercent,
      unreadAlerts: alertCount,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
