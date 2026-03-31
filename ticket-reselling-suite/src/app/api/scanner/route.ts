import { NextRequest, NextResponse } from "next/server";
import { scanUrl } from "@/lib/scanner";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

/**
 * POST /api/scanner
 * Body: { url: "https://www.stubhub.com/event/..." }
 *
 * Launches a headless Playwright browser, navigates to the URL,
 * intercepts API responses, extracts ticket listings, and returns
 * structured data. Also saves a market snapshot to the database.
 */

const ScanSchema = z.object({
  url: z.string().url(),
});

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = ScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid URL", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await scanUrl(parsed.data.url);

    // Save snapshot to database if we have an event match
    if (result.listings.length > 0) {
      // Try to match to an existing event by name
      const matchedEvent = await prisma.event.findFirst({
        where: { name: { contains: result.eventName.substring(0, 20) } },
        select: { id: true },
      });

      await prisma.marketSnapshot.create({
        data: {
          eventId: matchedEvent?.id ?? null,
          eventName: result.eventName,
          platform: result.platform,
          getInPrice: result.stats.getInPrice,
          medianPrice: result.stats.medianPrice,
          averagePrice: result.stats.averagePrice,
          maxPrice: result.stats.maxPrice,
          totalListings: result.stats.totalListings,
          totalTickets: result.stats.totalListings,
          granularity: "HOURLY",
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Scanner failed";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
