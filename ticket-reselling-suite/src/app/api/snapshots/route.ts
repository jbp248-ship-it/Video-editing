import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

// ─── GET /api/snapshots ──────────────────────────────────────────────────────
// Returns price trend data for a specific event.
// Query: ?eventId=xxx&platform=STUBHUB&section=101&days=7

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const platform = searchParams.get("platform");
  const section = searchParams.get("section");
  const days = parseInt(searchParams.get("days") ?? "7", 10);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: Record<string, unknown> = {
    capturedAt: { gte: since },
  };
  if (eventId) where.eventId = eventId;
  if (platform) where.platform = platform;
  if (section) where.section = section;

  const snapshots = await prisma.marketSnapshot.findMany({
    where,
    orderBy: { capturedAt: "asc" },
  });

  return NextResponse.json(snapshots);
}

// ─── POST /api/snapshots ─────────────────────────────────────────────────────
// Ingest market snapshots from the Chrome extension.
// eventId is optional — if eventName is provided, we auto-match to an event.

const CreateSnapshotSchema = z.object({
  eventId: z.string().optional(),
  eventName: z.string().optional(),
  platform: z.string(),
  section: z.string().nullable().optional(),
  getInPrice: z.number().positive(),
  medianPrice: z.number().positive().optional(),
  averagePrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  totalListings: z.number().int().nonnegative(),
  totalTickets: z.number().int().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const items = Array.isArray(body) ? body : [body];

  const validData = [];
  const errors = [];

  for (const item of items) {
    const parsed = CreateSnapshotSchema.safeParse(item);
    if (!parsed.success) {
      errors.push({ error: parsed.error.flatten(), input: item });
      continue;
    }

    let resolvedEventId = parsed.data.eventId ?? null;

    // Auto-match by eventName if no eventId provided.
    // Filter to upcoming events (within 90 days) to avoid matching old events.
    if (!resolvedEventId && parsed.data.eventName) {
      const ninetyDaysFromNow = new Date();
      ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
      const matched = await prisma.event.findFirst({
        where: {
          name: { contains: parsed.data.eventName },
          eventDate: { gte: new Date(), lte: ninetyDaysFromNow },
        },
        orderBy: { eventDate: "asc" },
        select: { id: true },
      });
      if (matched) resolvedEventId = matched.id;
    }

    validData.push({
      eventId: resolvedEventId,
      eventName: parsed.data.eventName ?? null,
      platform: parsed.data.platform,
      section: parsed.data.section ?? null,
      getInPrice: parsed.data.getInPrice,
      medianPrice: parsed.data.medianPrice ?? null,
      averagePrice: parsed.data.averagePrice ?? null,
      maxPrice: parsed.data.maxPrice ?? null,
      totalListings: parsed.data.totalListings,
      totalTickets: parsed.data.totalTickets ?? null,
      granularity: "HOURLY",
    });
  }

  let created = 0;
  if (validData.length > 0) {
    const result = await prisma.marketSnapshot.createMany({
      data: validData,
    });
    created = result.count;
  }

  return NextResponse.json(
    { created, errors: errors.length > 0 ? errors : undefined },
    { status: 201 }
  );
}
