/**
 * Market Snapshot Compaction Strategy
 *
 * Problem: Storing hourly snapshots forever bloats the database.
 * Solution: Roll up old hourly data into daily aggregates.
 *
 * Schedule: Run this daily via cron job or Vercel Cron.
 *
 * Timeline:
 * - Last 7 days: Keep HOURLY granularity (168 rows max per event/platform)
 * - 7-90 days: Compact to DAILY aggregates (83 rows max)
 * - 90+ days: Delete (or archive to cold storage)
 *
 * This keeps the table bounded at ~250 rows per event/platform pair,
 * ensuring sub-second queries even with hundreds of events.
 */

import { prisma } from "./db";

export async function compactSnapshots() {
  const now = new Date();

  // 1. Find hourly snapshots older than 7 days
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // 2. Delete anything older than 90 days
  const deleted = await prisma.marketSnapshot.deleteMany({
    where: { capturedAt: { lt: ninetyDaysAgo } },
  });

  // 3. Find hourly snapshots between 7-90 days that need compaction
  const hourlyToCompact = await prisma.marketSnapshot.findMany({
    where: {
      granularity: "HOURLY",
      capturedAt: { lt: sevenDaysAgo, gte: ninetyDaysAgo },
    },
    orderBy: { capturedAt: "asc" },
  });

  // Group by event + platform + section + date
  const groups = new Map<string, typeof hourlyToCompact>();

  for (const snap of hourlyToCompact) {
    const dateKey = snap.capturedAt.toISOString().split("T")[0];
    const key = `${snap.eventId}|${snap.platform}|${snap.section ?? "ALL"}|${dateKey}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(snap);
  }

  // 4. Create daily aggregates and delete hourly source rows
  let compacted = 0;

  for (const [, snaps] of groups) {
    if (snaps.length === 0) continue;

    const prices = snaps.map((s) => Number(s.getInPrice));
    const medians = snaps
      .map((s) => (s.medianPrice ? Number(s.medianPrice) : null))
      .filter((p): p is number => p !== null);
    const averages = snaps
      .map((s) => (s.averagePrice ? Number(s.averagePrice) : null))
      .filter((p): p is number => p !== null);
    const maxPrices = snaps
      .map((s) => (s.maxPrice ? Number(s.maxPrice) : null))
      .filter((p): p is number => p !== null);
    const listings = snaps.map((s) => s.totalListings);

    const avg = (arr: number[]) =>
      arr.length > 0
        ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
        : null;

    const sample = snaps[0];

    // Create daily aggregate
    await prisma.marketSnapshot.create({
      data: {
        eventId: sample.eventId,
        platform: sample.platform,
        section: sample.section,
        getInPrice: Math.min(...prices),
        medianPrice: avg(medians),
        averagePrice: avg(averages),
        maxPrice: maxPrices.length > 0 ? Math.max(...maxPrices) : null,
        totalListings: Math.round(
          listings.reduce((a, b) => a + b, 0) / listings.length
        ),
        totalTickets: null,
        granularity: "DAILY",
        capturedAt: sample.capturedAt,
      },
    });

    // Delete source hourly rows
    await prisma.marketSnapshot.deleteMany({
      where: { id: { in: snaps.map((s) => s.id) } },
    });

    compacted += snaps.length;
  }

  return {
    deleted: deleted.count,
    compacted,
    dailyAggregatesCreated: groups.size,
  };
}
