import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { cancelLock } from "@/lib/locking";
import { z } from "zod";

/**
 * POST /api/inventory/unlock
 * Body: { inventoryId: string }
 *
 * Cancels a false-positive lock. Restores inventory status to LISTED.
 * Use when a sale was wrongly detected and the ticket is still available.
 */

const UnlockSchema = z.object({
  inventoryId: z.string(),
});

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const parsed = UnlockSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await cancelLock(parsed.data.inventoryId);

  return NextResponse.json({ status: "unlocked", inventoryId: parsed.data.inventoryId });
}
