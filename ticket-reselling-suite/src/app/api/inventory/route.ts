import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

// ─── GET /api/inventory ──────────────────────────────────────────────────────
// Returns all inventory with event data, sorted by event date.
// Query params: ?status=LISTED&platform=STUBHUB&search=taylor

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const platform = searchParams.get("platform");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (platform) where.listPlatform = platform;
  if (search) {
    where.event = { name: { contains: search } };
  }

  const inventory = await prisma.inventory.findMany({
    where,
    include: { event: true, sales: true },
    orderBy: { event: { eventDate: "asc" } },
  });

  return NextResponse.json(inventory);
}

// ─── POST /api/inventory ─────────────────────────────────────────────────────

const CreateInventorySchema = z.object({
  eventId: z.string(),
  section: z.string(),
  row: z.string(),
  seatFrom: z.number().int().positive(),
  seatTo: z.number().int().positive(),
  quantity: z.number().int().positive().optional(),
  purchasePrice: z.number().positive(),
  purchasePlatform: z.string().optional(),
  listPrice: z.number().positive().optional(),
  listPlatform: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateInventorySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const quantity = data.quantity ?? data.seatTo - data.seatFrom + 1;

  const inventory = await prisma.inventory.create({
    data: {
      eventId: data.eventId,
      section: data.section,
      row: data.row,
      seatFrom: data.seatFrom,
      seatTo: data.seatTo,
      quantity,
      purchasePrice: data.purchasePrice,
      purchasePlatform: data.purchasePlatform,
      listPrice: data.listPrice,
      listPlatform: data.listPlatform,
      status: data.status ?? "IN_HAND",
      notes: data.notes,
    },
    include: { event: true },
  });

  return NextResponse.json(inventory, { status: 201 });
}
