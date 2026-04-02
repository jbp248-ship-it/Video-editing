import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// ─── GET /api/flare ─────────────────────────────────────────────────────────
// FLARE Score: a demand index (0-100) per event.
//   F — Floor price trend (rising floor = high demand)
//   L — Listing count (fewer listings = scarce supply)
//   A — Age to event (closer events with good demand = higher urgency)
//   R — Resale velocity (how fast listings are being sold)
//   E — Exposure risk (how much capital is tied up)

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    // Get all events with upcoming dates
    const events = await prisma.event.findMany({
      where: { eventDate: { gte: new Date() } },
      include: {
        inventory: true,
        marketSnapshots: {
          orderBy: { capturedAt: "desc" },
          take: 20,
        },
      },
      orderBy: { eventDate: "asc" },
    });

    const scores = events.map((event: any) => {
      const snaps = event.marketSnapshots;
      const inv = event.inventory;

      // F: Floor price trend (0-25) — rising floor = good
      let floorScore = 12;
      if (snaps.length >= 2) {
        const recent = snaps[0]?.getInPrice ?? 0;
        const older = snaps[snaps.length - 1]?.getInPrice ?? 0;
        if (older > 0) {
          const pctChange = ((recent - older) / older) * 100;
          floorScore = Math.min(25, Math.max(0, 12 + pctChange));
        }
      }

      // L: Listing scarcity (0-25) — fewer listings = more scarce
      const totalListings = snaps[0]?.totalListings ?? 100;
      const listingScore = Math.min(25, Math.max(0, 25 - (totalListings / 40) * 25));

      // A: Age to event urgency (0-20)
      const daysOut = Math.max(0, (event.eventDate.getTime() - Date.now()) / 86400000);
      let ageScore = 10;
      if (daysOut < 3) ageScore = 20;
      else if (daysOut < 7) ageScore = 17;
      else if (daysOut < 14) ageScore = 14;
      else if (daysOut < 30) ageScore = 10;
      else ageScore = 5;

      // R: Resale velocity (0-15)
      let velocityScore = 7;
      if (snaps.length >= 2) {
        const recentListings = snaps[0]?.totalListings ?? 0;
        const olderListings = snaps[Math.min(snaps.length - 1, 5)]?.totalListings ?? 0;
        const dropRate = olderListings > 0 ? ((olderListings - recentListings) / olderListings) * 100 : 0;
        velocityScore = Math.min(15, Math.max(0, dropRate * 1.5));
      }

      // E: Exposure risk (0-15) — less capital at risk = higher score
      const totalInvested = inv.reduce((s: number, i: any) => s + i.purchasePrice * i.quantity, 0);
      const exposureScore = totalInvested > 5000 ? 3 : totalInvested > 2000 ? 7 : totalInvested > 500 ? 10 : 15;

      const flareScore = Math.round(floorScore + listingScore + ageScore + velocityScore + exposureScore);

      // Buy signal
      let signal: "GREEN" | "YELLOW" | "RED" = "YELLOW";
      if (flareScore >= 70) signal = "GREEN";
      else if (flareScore < 40) signal = "RED";

      // Risk/reward calculation
      const avgPurchasePrice = inv.length > 0
        ? inv.reduce((s: number, i: any) => s + i.purchasePrice, 0) / inv.length
        : 0;
      const currentFloor = snaps[0]?.getInPrice ?? 0;
      const estimatedResale = currentFloor * 0.85; // conservative: 85% of floor after fees
      const projectedUpside = estimatedResale > 0 && avgPurchasePrice > 0
        ? ((estimatedResale - avgPurchasePrice) / avgPurchasePrice) * 100
        : 0;
      const lossProbability = flareScore >= 70 ? 10 : flareScore >= 50 ? 30 : flareScore >= 30 ? 55 : 75;

      return {
        eventId: event.id,
        eventName: event.name,
        venue: event.venue,
        eventDate: event.eventDate,
        daysOut: Math.round(daysOut),
        flareScore,
        signal,
        breakdown: {
          floorScore: Math.round(floorScore),
          listingScore: Math.round(listingScore),
          ageScore,
          velocityScore: Math.round(velocityScore),
          exposureScore,
        },
        riskReward: {
          totalInvested: Math.round(totalInvested * 100) / 100,
          currentFloor,
          estimatedResale: Math.round(estimatedResale * 100) / 100,
          projectedUpside: Math.round(projectedUpside * 100) / 100,
          lossProbability,
        },
        ticketsHeld: inv.filter((i: any) => i.status === "IN_HAND" || i.status === "LISTED").reduce((s: number, i: any) => s + i.quantity, 0),
        ticketsAvailable: snaps[0]?.totalListings ?? null,
      };
    });

    return NextResponse.json(scores.sort((a: any, b: any) => b.flareScore - a.flareScore));
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
