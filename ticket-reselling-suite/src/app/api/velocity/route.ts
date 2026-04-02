import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// ─── GET /api/velocity ──────────────────────────────────────────────────────
// Supply/Demand velocity: how fast tickets are being sold for each event.
// Returns snapshots over time showing remaining tickets and listing counts.

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const events = await prisma.event.findMany({
      where: { eventDate: { gte: new Date() } },
      include: {
        marketSnapshots: {
          orderBy: { capturedAt: "asc" },
          take: 50,
        },
        inventory: {
          where: { status: { in: ["IN_HAND", "LISTED"] } },
        },
      },
      orderBy: { eventDate: "asc" },
    });

    const velocityData = events
      .filter((e: any) => e.marketSnapshots.length >= 2)
      .map((event: any) => {
        const snaps = event.marketSnapshots;
        const first = snaps[0];
        const last = snaps[snaps.length - 1];

        // Calculate velocity: listings dropped per day
        const timeDiff = (new Date(last.capturedAt).getTime() - new Date(first.capturedAt).getTime()) / 86400000;
        const listingDrop = (first.totalListings ?? 0) - (last.totalListings ?? 0);
        const velocityPerDay = timeDiff > 0 ? listingDrop / timeDiff : 0;

        // Estimate sellout date
        const currentListings = last.totalListings ?? 0;
        const daysToSellout = velocityPerDay > 0 ? currentListings / velocityPerDay : null;
        const daysToEvent = Math.max(0, (event.eventDate.getTime() - Date.now()) / 86400000);

        // Demand level: HIGH if selling faster than days remaining
        let demandLevel: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
        if (daysToSellout !== null && daysToSellout < daysToEvent * 0.5) demandLevel = "HIGH";
        else if (velocityPerDay < 1) demandLevel = "LOW";

        // Snapshot timeline for chart
        const timeline = snaps.map((s: any) => ({
          date: s.capturedAt,
          listings: s.totalListings ?? 0,
          getInPrice: s.getInPrice,
          medianPrice: s.medianPrice,
        }));

        return {
          eventId: event.id,
          eventName: event.name,
          venue: event.venue,
          eventDate: event.eventDate,
          daysToEvent: Math.round(daysToEvent),
          currentListings,
          velocityPerDay: Math.round(velocityPerDay * 10) / 10,
          daysToSellout: daysToSellout ? Math.round(daysToSellout) : null,
          demandLevel,
          ticketsHeld: event.inventory.reduce((s: number, i: any) => s + i.quantity, 0),
          currentFloor: last.getInPrice,
          priceChange: first.getInPrice > 0
            ? Math.round(((last.getInPrice - first.getInPrice) / first.getInPrice) * 10000) / 100
            : 0,
          timeline,
        };
      })
      .sort((a: any, b: any) => b.velocityPerDay - a.velocityPerDay);

    return NextResponse.json(velocityData);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
