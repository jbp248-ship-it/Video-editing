import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// ─── GET /api/history ───────────────────────────────────────────────────────
// Returns time-series data for charting price trends + sold progression.
// Query: ?eventId=xxx&days=30

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");
    const days = parseInt(searchParams.get("days") ?? "30", 10);

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId is required" },
        { status: 400 }
      );
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    // Fetch the event to get capacity
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { capacity: true },
    });

    const snapshots = await prisma.marketSnapshot.findMany({
      where: {
        eventId,
        capturedAt: { gte: since },
      },
      orderBy: { capturedAt: "asc" },
    });

    const capacity = event?.capacity ?? null;

    const result = snapshots.map((snap, index) => {
      const prevListings =
        index > 0 ? snapshots[index - 1].totalListings : null;
      const listingsDelta =
        prevListings !== null ? snap.totalListings - prevListings : null;

      const soldPercentage =
        capacity !== null
          ? ((capacity - snap.totalListings) / capacity) * 100
          : snap.soldPercentage ?? null;

      return {
        date: snap.capturedAt,
        getInPrice: snap.getInPrice,
        medianPrice: snap.medianPrice,
        totalListings: snap.totalListings,
        soldCount: snap.soldCount,
        soldPercentage,
        listingsDelta,
      };
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
