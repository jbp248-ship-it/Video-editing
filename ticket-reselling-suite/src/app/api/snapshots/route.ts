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
// Ingest market snapshots from the Chrome extension.

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
  const authError = requireAuth(req);
  if (authError) return authError;

  const body = await req.json();

  // Support batch ingestion
  const items = Array.isArray(body) ? body : [body];

  // Validate all items first
  const validData = [];
  const errors = [];
  for (const item of items) {
    const parsed = CreateSnapshotSchema.safeParse(item);
    if (!parsed.success) {
      errors.push({ error: parsed.error.flatten(), input: item });
    } else {
      validData.push({
        eventId: parsed.data.eventId,
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
  }

  // Batch insert all valid snapshots in a single query
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
