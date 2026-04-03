import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const venue = searchParams.get("venue");
    const artist = searchParams.get("artist");

    if (!venue && !artist) {
      return NextResponse.json({ error: "Provide venue or artist param" }, { status: 400 });
    }

    const where: any = {};
    if (venue) where.venue = { contains: venue };
    if (artist) where.name = { contains: artist };

    const events = await prisma.event.findMany({
      where,
      include: {
        marketSnapshots: { orderBy: { capturedAt: "desc" }, take: 5 },
        inventory: true,
        _count: { select: { marketSnapshots: true } },
      },
      orderBy: { eventDate: "desc" },
      take: 20,
    });

    const history = events.map((event: any) => {
      const snaps = event.marketSnapshots;
      const isPast = new Date(event.eventDate) < new Date();
      const lastSnap = snaps[0];
      const likelySoldOut = lastSnap && isPast && (lastSnap.totalListings ?? 0) < 5;

      return {
        id: event.id,
        name: event.name,
        venue: event.venue,
        date: event.eventDate,
        isPast,
        likelySoldOut,
        lastKnownFloor: lastSnap?.getInPrice ?? null,
        lastKnownListings: lastSnap?.totalListings ?? null,
        snapshotCount: event._count.marketSnapshots,
        ticketsHeld: event.inventory.reduce((s: number, i: any) => s + i.quantity, 0),
        capacity: event.capacity,
      };
    });

    const pastEvents = history.filter((h: any) => h.isPast);
    const soldOutRate = pastEvents.length > 0
      ? pastEvents.filter((h: any) => h.likelySoldOut).length / pastEvents.length
      : null;

    return NextResponse.json({
      query: { venue, artist },
      totalEvents: history.length,
      soldOutRate: soldOutRate != null ? Math.round(soldOutRate * 100) : null,
      events: history,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
