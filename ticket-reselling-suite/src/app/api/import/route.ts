import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const { csv } = await req.json();
    if (!csv || typeof csv !== "string") {
      return NextResponse.json({ error: "Missing csv field" }, { status: 400 });
    }

    const lines = csv.trim().split("\n").map(l => l.trim()).filter(l => l);
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must have a header and at least one data row" }, { status: 400 });
    }

    const header = lines[0].toLowerCase().split(",").map(h => h.trim());
    const results = { created: 0, errors: [] as string[] };

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim());
      try {
        // Map columns dynamically based on header
        const get = (names: string[]) => {
          for (const n of names) {
            const idx = header.findIndex(h => h.includes(n));
            if (idx >= 0 && cols[idx]) return cols[idx];
          }
          return "";
        };

        const eventName = get(["event", "name"]);
        const dateStr = get(["date"]);
        const venue = get(["venue"]);
        const section = get(["section", "sec"]) || "GA";
        const row = get(["row"]) || "1";
        const seatFrom = parseInt(get(["seat from", "seat_from"]) || "1") || 1;
        const qty = parseInt(get(["qty", "quantity"]) || "1") || 1;
        const seatTo = parseInt(get(["seat to", "seat_to"]) || String(seatFrom + qty - 1)) || seatFrom + qty - 1;
        const price = parseFloat(get(["price", "cost"]).replace(/[$,]/g, "")) || 0;
        const platform = get(["platform"]) || "OTHER";
        const status = get(["status"]) || "IN_HAND";

        if (!eventName || !dateStr) {
          results.errors.push(`Row ${i + 1}: missing event name or date`);
          continue;
        }

        const eventDate = new Date(dateStr);
        if (isNaN(eventDate.getTime())) {
          results.errors.push(`Row ${i + 1}: invalid date "${dateStr}"`);
          continue;
        }

        // Upsert event (match by name + date)
        let event = await prisma.event.findFirst({
          where: { name: eventName, eventDate: { gte: new Date(eventDate.toDateString()), lt: new Date(new Date(eventDate).setDate(eventDate.getDate() + 1)) } },
        });
        if (!event) {
          event = await prisma.event.create({
            data: { name: eventName, venue, eventDate },
          });
        }

        // Create inventory
        await prisma.inventory.create({
          data: {
            eventId: event.id,
            section,
            row,
            seatFrom,
            seatTo,
            quantity: qty,
            purchasePrice: price,
            purchasePlatform: platform.toUpperCase(),
            status: status.toUpperCase(),
          },
        });

        results.created++;
      } catch (err: any) {
        results.errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    return NextResponse.json(results, { status: results.created > 0 ? 201 : 400 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
