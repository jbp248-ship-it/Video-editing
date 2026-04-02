import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// ─── GET /api/analytics ─────────────────────────────────────────────────────
// Full P&L analytics: capital invested, ROI, active inventory value,
// realized profit, per-platform breakdown, monthly trends.

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const [allInventory, allSales, events] = await Promise.all([
      prisma.inventory.findMany({
        include: { event: true },
      }),
      prisma.sale.findMany({
        include: { inventory: { include: { event: true } } },
        orderBy: { saleDate: "desc" },
      }),
      prisma.event.findMany({
        where: { eventDate: { gte: new Date() } },
        include: { marketSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
      }),
    ]);

    // ── Capital Summary ──
    const totalCapitalInvested = allInventory.reduce(
      (s: number, i: any) => s + i.purchasePrice * i.quantity, 0
    );
    const activeInventory = allInventory.filter(
      (i: any) => i.status === "IN_HAND" || i.status === "LISTED"
    );
    const activeInventoryValue = activeInventory.reduce(
      (s: number, i: any) => s + i.purchasePrice * i.quantity, 0
    );
    // Estimate current market value from floor prices
    let estimatedMarketValue = 0;
    for (const inv of activeInventory) {
      const event = events.find((e: any) => e.id === inv.eventId);
      const floor = event?.marketSnapshots[0]?.getInPrice;
      if (floor && floor > 0) {
        estimatedMarketValue += floor * inv.quantity;
      } else {
        estimatedMarketValue += (inv.listPrice ?? inv.purchasePrice) * inv.quantity;
      }
    }

    const totalRevenue = allSales.reduce((s: number, sale: any) => s + (sale.netRevenue ?? 0), 0);
    const totalProfit = allSales.reduce((s: number, sale: any) => s + (sale.netProfit ?? 0), 0);
    const totalFees = allSales.reduce(
      (s: number, sale: any) => s + (sale.platformFee ?? 0) + (sale.processingFee ?? 0), 0
    );
    const soldCapital = allSales.reduce(
      (s: number, sale: any) => s + (sale.inventory?.purchasePrice ?? 0) * (sale.quantitySold ?? 0), 0
    );
    const allTimeROI = soldCapital > 0
      ? (totalProfit / soldCapital) * 100
      : 0;

    // ── Per-Platform Breakdown ──
    const platformMap: Record<string, { sales: number; revenue: number; profit: number; fees: number }> = {};
    for (const sale of allSales) {
      const platform = sale.platform ?? "UNKNOWN";
      if (!platformMap[platform]) {
        platformMap[platform] = { sales: 0, revenue: 0, profit: 0, fees: 0 };
      }
      const p = platformMap[platform];
      p.sales++;
      p.revenue += sale.netRevenue ?? 0;
      p.profit += sale.netProfit ?? 0;
      p.fees += (sale.platformFee ?? 0) + (sale.processingFee ?? 0);
    }
    const platformBreakdown = Object.entries(platformMap).map(([platform, data]) => ({
      platform,
      ...data,
      roi: (data.revenue - data.profit) > 0 ? (data.profit / (data.revenue - data.profit)) * 100 : data.profit > 0 ? 100 : 0,
    })).sort((a, b) => b.profit - a.profit);

    // ── Monthly Trends (last 12 months) ──
    const monthlyMap: Record<string, { revenue: number; profit: number; sales: number; invested: number }> = {};
    for (let m = 11; m >= 0; m--) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap[key] = { revenue: 0, profit: 0, sales: 0, invested: 0 };
    }
    for (const sale of allSales) {
      const d = new Date(sale.saleDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyMap[key]) {
        monthlyMap[key].revenue += sale.netRevenue ?? 0;
        monthlyMap[key].profit += sale.netProfit ?? 0;
        monthlyMap[key].sales++;
      }
    }
    for (const inv of allInventory) {
      const d = new Date(inv.purchaseDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyMap[key]) {
        monthlyMap[key].invested += inv.purchasePrice * inv.quantity;
      }
    }
    const monthlyTrends = Object.entries(monthlyMap).map(([month, data]) => ({
      month,
      ...data,
    }));

    // ── Top Events by Profit ──
    const eventProfitMap: Record<string, { name: string; profit: number; revenue: number; sales: number }> = {};
    for (const sale of allSales) {
      const eid = sale.inventory?.eventId;
      if (!eid) continue;
      const ename = sale.inventory?.event?.name ?? "Unknown";
      if (!eventProfitMap[eid]) {
        eventProfitMap[eid] = { name: ename, profit: 0, revenue: 0, sales: 0 };
      }
      eventProfitMap[eid].profit += sale.netProfit;
      eventProfitMap[eid].revenue += sale.netRevenue;
      eventProfitMap[eid].sales++;
    }
    const topEvents = Object.values(eventProfitMap)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    return NextResponse.json({
      summary: {
        totalCapitalInvested: round(totalCapitalInvested),
        activeInventoryValue: round(activeInventoryValue),
        estimatedMarketValue: round(estimatedMarketValue),
        unrealizedGain: round(estimatedMarketValue - activeInventoryValue),
        totalRevenue: round(totalRevenue),
        totalProfit: round(totalProfit),
        totalFees: round(totalFees),
        allTimeROI: round(allTimeROI),
        totalSales: allSales.length,
        activeTickets: activeInventory.reduce((s: number, i: any) => s + i.quantity, 0),
      },
      platformBreakdown,
      monthlyTrends,
      topEvents,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
