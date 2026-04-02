import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// ─── GET /api/history/aggregate ─────────────────────────────────────────────
// Aggregate historical data across ALL events for long-term trend analysis.
// Query: ?days=90&platform=STUBHUB

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") ?? "90", 10);
    const platform = searchParams.get("platform");

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: Record<string, unknown> = {
      capturedAt: { gte: since },
    };
    if (platform) where.platform = platform;

    const snapshots = await prisma.marketSnapshot.findMany({
      where,
      orderBy: { capturedAt: "asc" },
    });

    const totalSnapshotsCollected = snapshots.length;

    if (totalSnapshotsCollected === 0) {
      return NextResponse.json({
        totalSnapshotsCollected: 0,
        avgGetInPrice: null,
        priceRange: null,
        soldVelocityTrend: null,
        topEvents: [],
      });
    }

    // Compute aggregate price stats
    const prices = snapshots.map((s) => s.getInPrice);
    const avgGetInPrice =
      prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const priceRange = {
      min: Math.min(...prices),
      max: Math.max(...prices),
    };

    // Compute sold velocity trend: average soldCount per snapshot (where available)
    const soldCounts = snapshots
      .filter((s) => s.soldCount !== null)
      .map((s) => s.soldCount!);
    const soldVelocityTrend =
      soldCounts.length > 0
        ? soldCounts.reduce((sum, c) => sum + c, 0) / soldCounts.length
        : null;

    // Top events by snapshot count
    const eventCounts = new Map<
      string,
      { eventId: string; eventName: string | null; count: number; avgPrice: number; totalPrice: number }
    >();
    for (const snap of snapshots) {
      const key = snap.eventId ?? snap.eventName ?? "unknown";
      const existing = eventCounts.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalPrice += snap.getInPrice;
        existing.avgPrice = existing.totalPrice / existing.count;
      } else {
        eventCounts.set(key, {
          eventId: snap.eventId ?? key,
          eventName: snap.eventName,
          count: 1,
          avgPrice: snap.getInPrice,
          totalPrice: snap.getInPrice,
        });
      }
    }

    const topEvents = Array.from(eventCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ eventId, eventName, count, avgPrice }) => ({
        eventId,
        eventName,
        snapshotCount: count,
        avgGetInPrice: Math.round(avgPrice * 100) / 100,
      }));

    return NextResponse.json({
      totalSnapshotsCollected,
      avgGetInPrice: Math.round(avgGetInPrice * 100) / 100,
      priceRange,
      soldVelocityTrend:
        soldVelocityTrend !== null
          ? Math.round(soldVelocityTrend * 100) / 100
          : null,
      topEvents,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
