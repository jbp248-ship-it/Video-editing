import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

// ─── GET /api/snapshots ──────────────────────────────────────────────────────
// Returns price trend data for a specific event.
// Query: ?eventId=xxx&platform=STUBHUB&section=101&days=7

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const platform = searchParams.get("platform");
  const section = searchParams.get("section");
  const days = parseInt(searchParams.get("days") ?? "7", 10);

  if (!eventId) {
    return NextResponse.json(
      { error: "eventId is required" },
      { status: 400 }
    );
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: Record<string, unknown> = {
    eventId,
    capturedAt: { gte: since },
  };
  if (platform) where.platform = platform;
  if (section) where.section = section;

  const snapshots = await prisma.marketSnapshot.findMany({
    where,
    orderBy: { capturedAt: "asc" },
  });

  return NextResponse.json(snapshots);
}

// ─── POST /api/snapshots ─────────────────────────────────────────────────────
// Ingest a market snapshot from the Chrome extension.

const CreateSnapshotSchema = z.object({
  eventId: z.string(),
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
  const body = await req.json();

  // Support batch ingestion
  const items = Array.isArray(body) ? body : [body];

  const results = [];
  for (const item of items) {
    const parsed = CreateSnapshotSchema.safeParse(item);
    if (!parsed.success) {
      results.push({ error: parsed.error.flatten(), input: item });
      continue;
    }

    const data = parsed.data;
    const snapshot = await prisma.marketSnapshot.create({
      data: {
        eventId: data.eventId,
        platform: data.platform as never,
        section: data.section ?? null,
        getInPrice: data.getInPrice,
        medianPrice: data.medianPrice,
        averagePrice: data.averagePrice,
        maxPrice: data.maxPrice,
        totalListings: data.totalListings,
        totalTickets: data.totalTickets,
        granularity: "HOURLY",
      },
    });
    results.push(snapshot);
  }

  return NextResponse.json(results, { status: 201 });
}
