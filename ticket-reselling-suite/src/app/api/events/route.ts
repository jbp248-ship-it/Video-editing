import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

// ─── GET /api/events ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (search) {
      where.name = { contains: search };
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        _count: { select: { inventory: true, marketSnapshots: true } },
      },
      orderBy: { eventDate: "asc" },
    });

    return NextResponse.json(events);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── POST /api/events ────────────────────────────────────────────────────────

const CreateEventSchema = z.object({
  name: z.string().min(1),
  venue: z.string().min(1),
  city: z.string().optional(),
  state: z.string().optional(),
  eventDate: z.string().refine((s) => !isNaN(Date.parse(s)), {
    message: "Invalid date format",
  }).transform((s) => new Date(s)),
  category: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = CreateEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const event = await prisma.event.create({ data: parsed.data });
    return NextResponse.json(event, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
