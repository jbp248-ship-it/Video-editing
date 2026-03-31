import { NextResponse } from "next/server";
import { compactSnapshots } from "@/lib/snapshot-compaction";

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

export async function GET() {
  const result = await compactSnapshots();
  return NextResponse.json({ status: "ok", ...result });
}
