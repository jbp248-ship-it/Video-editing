import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// ─── GET /api/alerts ─────────────────────────────────────────────────────────
// Returns unread/undismissed alerts, newest first.

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const showAll = searchParams.get("all") === "true";

  const where = showAll ? {} : { dismissed: false };

  const alerts = await prisma.alert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(alerts);
}

// ─── PATCH /api/alerts ───────────────────────────────────────────────────────
// Mark alerts as read or dismissed.

export async function PATCH(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { ids, action } = body as {
    ids: string[];
    action: "read" | "dismiss";
  };

  if (!ids?.length || !["read", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const data = action === "read" ? { read: true } : { dismissed: true };

  await prisma.alert.updateMany({
    where: { id: { in: ids } },
    data,
  });

  return NextResponse.json({ updated: ids.length });
}
