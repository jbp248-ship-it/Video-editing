import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        marketSnapshots: { orderBy: { capturedAt: "desc" }, take: 20 },
        inventory: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const snaps = event.marketSnapshots;
    const inv = event.inventory;
    const daysToEvent = Math.max(0, (event.eventDate.getTime() - Date.now()) / 86400000);

    const factors: Array<{ name: string; score: number; detail: string }> = [];
    const risks: string[] = [];
    const upsides: string[] = [];

    // Factor 1: Supply trend
    if (snaps.length >= 2) {
      const recent = snaps[0]?.totalListings ?? 0;
      const older = snaps[Math.min(snaps.length - 1, 5)]?.totalListings ?? 0;
      const drop = older - recent;
      if (drop > 10) {
        factors.push({ name: "Supply Trend", score: 2, detail: `${drop} listings removed recently — selling fast` });
        upsides.push("Tickets are selling quickly");
      } else if (drop > 0) {
        factors.push({ name: "Supply Trend", score: 1, detail: `${drop} listings removed — moderate demand` });
      } else if (drop < 0) {
        factors.push({ name: "Supply Trend", score: -1, detail: `Listings increasing — more sellers entering market` });
        risks.push("Supply is increasing which may push prices down");
      } else {
        factors.push({ name: "Supply Trend", score: 0, detail: "Listings stable — no clear trend" });
      }
    } else {
      factors.push({ name: "Supply Trend", score: 0, detail: "Not enough data — need more scans" });
    }

    // Factor 2: Price trend
    if (snaps.length >= 2) {
      const recentPrice = snaps[0]?.getInPrice ?? 0;
      const olderPrice = snaps[Math.min(snaps.length - 1, 5)]?.getInPrice ?? 0;
      if (olderPrice > 0) {
        const pctChange = ((recentPrice - olderPrice) / olderPrice) * 100;
        if (pctChange > 5) {
          factors.push({ name: "Price Trend", score: 1, detail: `Floor price up ${pctChange.toFixed(0)}% ($${olderPrice.toFixed(0)} → $${recentPrice.toFixed(0)})` });
          upsides.push("Prices are trending upward");
        } else if (pctChange < -5) {
          factors.push({ name: "Price Trend", score: -1, detail: `Floor price down ${Math.abs(pctChange).toFixed(0)}% ($${olderPrice.toFixed(0)} → $${recentPrice.toFixed(0)})` });
          risks.push("Prices are dropping");
        } else {
          factors.push({ name: "Price Trend", score: 0, detail: `Price stable at ~$${recentPrice.toFixed(0)}` });
        }
      }
    } else {
      factors.push({ name: "Price Trend", score: 0, detail: "Not enough price data" });
    }

    // Factor 3: Days to event
    if (daysToEvent < 2) {
      factors.push({ name: "Time to Event", score: -2, detail: `Only ${Math.round(daysToEvent * 24)}h left — very high risk` });
      risks.push("Almost no time to sell if you buy now");
    } else if (daysToEvent < 7) {
      factors.push({ name: "Time to Event", score: -1, detail: `${Math.round(daysToEvent)} days left — getting risky` });
    } else if (daysToEvent < 30) {
      factors.push({ name: "Time to Event", score: 1, detail: `${Math.round(daysToEvent)} days out — good window` });
    } else {
      factors.push({ name: "Time to Event", score: 0, detail: `${Math.round(daysToEvent)} days out — early` });
    }

    // Factor 4: Venue history (has this artist/venue sold out before?)
    const pastEvents = await prisma.event.findMany({
      where: {
        venue: event.venue,
        eventDate: { lt: new Date() },
      },
      include: { marketSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
      take: 10,
    });
    const pastSoldOut = pastEvents.filter((e: any) => {
      const lastSnap = e.marketSnapshots[0];
      return lastSnap && (lastSnap.totalListings ?? 0) < 5;
    });
    if (pastEvents.length > 0) {
      const rate = pastSoldOut.length / pastEvents.length;
      if (rate > 0.5) {
        factors.push({ name: "Venue History", score: 2, detail: `${Math.round(rate * 100)}% of past events at this venue likely sold out` });
        upsides.push("This venue has a strong sellout history");
      } else if (rate > 0.2) {
        factors.push({ name: "Venue History", score: 1, detail: `${Math.round(rate * 100)}% sellout rate at this venue` });
      } else {
        factors.push({ name: "Venue History", score: -1, detail: `Low sellout rate at this venue (${Math.round(rate * 100)}%)` });
        risks.push("Events at this venue don't typically sell out");
      }
    } else {
      factors.push({ name: "Venue History", score: 0, detail: "No past event data for this venue" });
    }

    // Factor 5: Current exposure
    const totalInvested = inv.reduce((s: number, i: any) => s + (i.purchasePrice ?? 0) * (i.quantity ?? 0), 0);
    if (totalInvested > 5000) {
      factors.push({ name: "Your Exposure", score: -2, detail: `$${totalInvested.toFixed(0)} already invested — high risk` });
      risks.push("You have significant capital already at risk in this event");
    } else if (totalInvested > 1000) {
      factors.push({ name: "Your Exposure", score: -1, detail: `$${totalInvested.toFixed(0)} already invested` });
    } else if (totalInvested > 0) {
      factors.push({ name: "Your Exposure", score: 0, detail: `$${totalInvested.toFixed(0)} invested — moderate` });
    } else {
      factors.push({ name: "Your Exposure", score: 1, detail: "No existing position — low risk entry" });
    }

    // Calculate total score and recommendation
    const totalScore = factors.reduce((s, f) => s + f.score, 0);
    const maxPossible = factors.length * 2;
    const confidence = Math.min(100, Math.round((snaps.length / 10) * 50 + (pastEvents.length / 5) * 50));

    let recommendation: "BUY" | "HOLD" | "DONT_BUY";
    let summary: string;
    if (totalScore >= 3) {
      recommendation = "BUY";
      summary = "Strong buy — " + (upsides[0] ?? "positive indicators outweigh risks");
    } else if (totalScore >= 0) {
      recommendation = "HOLD";
      summary = "Hold — mixed signals, " + (risks[0] ?? "wait for more data");
    } else {
      recommendation = "DONT_BUY";
      summary = "Don't buy — " + (risks[0] ?? "negative indicators outweigh potential upside");
    }

    return NextResponse.json({
      eventId,
      eventName: event.name,
      venue: event.venue,
      eventDate: event.eventDate,
      recommendation,
      score: totalScore,
      maxScore: maxPossible,
      confidence,
      summary,
      factors,
      risks,
      upside: upsides.join(". ") || "No clear upside identified",
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
