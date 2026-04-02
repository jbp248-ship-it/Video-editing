import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// POST /api/alerts/floor-check — check all events for declining floor prices

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const events = await prisma.event.findMany({
      where: { eventDate: { gte: new Date() } },
      include: {
        inventory: { where: { status: { in: ["IN_HAND", "LISTED"] } } },
        marketSnapshots: { orderBy: { capturedAt: "desc" }, take: 10 },
      },
    });

    let alertsCreated = 0;

    for (const event of events) {
      const snaps = event.marketSnapshots;
      if (snaps.length < 3) continue;

      // Check for 3 consecutive floor price drops
      const prices = snaps.slice(0, 3).map(s => s.getInPrice);
      const isDropping = prices[0] < prices[1] && prices[1] < prices[2];

      if (isDropping && event.inventory.length > 0) {
        const dropPct = ((prices[2] - prices[0]) / prices[2] * 100).toFixed(1);

        // Don't create duplicate alerts
        const existing = await prisma.alert.findFirst({
          where: {
            eventId: event.id,
            type: "FLOOR_DROP",
            dismissed: false,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });

        if (!existing) {
          await prisma.alert.create({
            data: {
              type: "FLOOR_DROP",
              title: `⚠️ Floor price dropping: ${event.name}`,
              message: `Floor price has dropped ${dropPct}% over the last 3 snapshots (${prices.map(p => "$" + p.toFixed(0)).join(" → ")}). Consider liquidating to minimize losses.`,
              eventId: event.id,
            },
          });
          alertsCreated++;
        }
      }
    }

    return NextResponse.json({ alertsCreated });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
