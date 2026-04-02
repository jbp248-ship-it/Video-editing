import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

// ─── GET /api/settings ───────────────────────────────────────────────────────
// Returns all settings as a flat { key: value } object.

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const settings = await prisma.setting.findMany();

    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/settings ──────────────────────────────────────────────────────
// Upsert a single setting { key, value }.

const VALID_SETTING_KEYS = new Set([
  "fee_STUBHUB",
  "fee_TICKETMASTER",
  "fee_VIVID_SEATS",
  "fee_SEATGEEK",
  "fee_ETIX",
  "fee_AXS",
  "fee_TICKPICK",
  "fee_GAMETIME",
]);

const UpsertSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = UpsertSettingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { key, value } = parsed.data;

    if (!key.startsWith("fee_") || !VALID_SETTING_KEYS.has(key)) {
      return NextResponse.json({ error: "Invalid setting key" }, { status: 400 });
    }

    const numericValue = parseFloat(value);
    if (isNaN(numericValue) || numericValue < 0 || numericValue > 100) {
      return NextResponse.json(
        { error: "Value must be a number between 0 and 100" },
        { status: 400 }
      );
    }

    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    return NextResponse.json(setting);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
