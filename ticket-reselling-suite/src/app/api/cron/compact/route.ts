import { NextRequest, NextResponse } from "next/server";
import { compactSnapshots } from "@/lib/snapshot-compaction";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/cron/compact
 *
 * Trigger snapshot compaction. Call this via:
 * - Vercel Cron (vercel.json crons config)
 * - External cron service (e.g., cron-job.org)
 * - Manual trigger from dashboard
 *
 * Recommended: Run once daily at ~3 AM.
 */

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, { allowLocalReads: true });
  if (authError) return authError;

  const result = await compactSnapshots();
  return NextResponse.json({ status: "ok", ...result });
}
