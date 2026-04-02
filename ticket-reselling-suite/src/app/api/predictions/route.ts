import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { predictEvent, predictAll } from "@/lib/predictions";

// ─── GET /api/predictions ───────────────────────────────────────────────────
// Returns price predictions for upcoming events.
//   ?eventId=xxx  → prediction for a single event
//   (no params)   → predictions for all upcoming events

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const eventId = new URL(req.url).searchParams.get("eventId");

    if (eventId) {
      const prediction = await predictEvent(eventId);
      if (!prediction) {
        return NextResponse.json(
          { error: "Event not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(prediction);
    }

    const predictions = await predictAll();
    return NextResponse.json(predictions);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
