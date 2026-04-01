import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

// ─── GET /api/settings ───────────────────────────────────────────────────────
// Returns all settings as a flat { key: value } object.

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const settings = await prisma.setting.findMany();

  const result: Record<string, string> = {};
  for (const s of settings) {
    result[s.key] = s.value;
  }

  return NextResponse.json(result);
}

// ─── POST /api/settings ──────────────────────────────────────────────────────
// Upsert a single setting { key, value }.

const UpsertSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const parsed = UpsertSettingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { key, value } = parsed.data;

  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  return NextResponse.json(setting);
}
