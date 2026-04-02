import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

// ─── POST /api/events/capacity ──────────────────────────────────────────────
// Set venue capacity and genre for an event (manual entry or from ticketdata).

const UpdateCapacitySchema = z.object({
  eventId: z.string().min(1),
  capacity: z.number().int().positive(),
  genre: z
    .enum(["Concert", "Sports", "Theater", "Comedy", "Festival"])
    .optional(),
});

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = UpdateCapacitySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { eventId, capacity, genre } = parsed.data;

    const event = await prisma.event.update({
      where: { id: eventId },
      data: {
        capacity,
        ...(genre !== undefined && { genre }),
      },
    });

    return NextResponse.json(event);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
