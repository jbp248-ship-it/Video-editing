/**
 * TickPick platform-specific scanner
 * TickPick (tickpick.com) is a no-fee resale marketplace.
 * All prices shown are final (no hidden fees).
 */

import type { Page } from "playwright";

export interface TickPickListing {
  section: string;
  row: string;
  price: number;
  quantity: number;
  priceWithFees: number | null;
  ticketsRemaining: number | null;
}

export interface TickPickScanResult {
  listings: TickPickListing[];
  totalTicketsRemaining: number | null;
  eventName: string;
  venue: string;
  date: string;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

/**
 * Extract from TickPick JSON responses.
 * TickPick's API uses: price (already all-in), section, row, quantity, numTickets
 */
export function extractTickPickFromJson(obj: unknown, depth = 0): TickPickListing[] {
  if (depth > 10 || !obj || typeof obj !== "object") return [];
  const results: TickPickListing[] = [];

  if (!Array.isArray(obj)) {
    const o = obj as Record<string, unknown>;
    const price = toNum(o.price) ?? toNum(o.ourPrice) ?? toNum(o.displayPrice) ??
      toNum(o.listPrice) ?? toNum(o.totalPrice) ?? toNum(o.amount);

    if (price && price > 0 && price < 100000 &&
        (o.section !== undefined || o.sectionName !== undefined || o.row !== undefined || o.zone !== undefined)) {
      results.push({
        price,
        section: String(o.section ?? o.sectionName ?? o.zone ?? o.zoneName ?? ""),
        row: String(o.row ?? o.rowName ?? o.seatRow ?? ""),
        quantity: toNum(o.numTickets) ?? toNum(o.quantity) ?? toNum(o.available) ?? 1,
        priceWithFees: price, // TickPick prices are all-in (no fees)
        ticketsRemaining: toNum(o.numTickets) ?? toNum(o.quantity) ?? toNum(o.available) ?? toNum(o.remaining) ?? null,
      });
      return results;
    }
  }

  if (Array.isArray(obj)) {
    for (const item of obj) results.push(...extractTickPickFromJson(item, depth + 1));
    return results;
  }

  const o = obj as Record<string, unknown>;
  const keysToCheck = [
    "listings", "tickets", "offers", "items", "data", "results",
    "inventory", "content", "body", "payload", "groups", "sections",
    "pageProps", "props", "initialData",
  ];
  for (const key of keysToCheck) {
    if (o[key] !== undefined) results.push(...extractTickPickFromJson(o[key], depth + 1));
  }
  return results;
}

/**
 * Extract from TickPick's rendered DOM.
 */
export async function extractTickPickFromDom(page: Page): Promise<TickPickScanResult> {
  return page.evaluate(() => {
    const listings: Array<{
      section: string; row: string; price: number; quantity: number;
      priceWithFees: number | null; ticketsRemaining: number | null;
    }> = [];

    let eventName = "";
    let venue = "";
    let date = "";
    let totalTicketsRemaining: number | null = null;

    try {
      const h1 = document.querySelector("h1");
      eventName = h1?.textContent?.trim() ?? document.title;
      const venueEl = document.querySelector('[class*="venue" i], [class*="location" i]');
      venue = venueEl?.textContent?.trim() ?? "";
      const dateEl = document.querySelector("time, [datetime], [class*='date' i]");
      date = dateEl?.getAttribute("datetime") ?? dateEl?.textContent?.trim() ?? "";
    } catch {}

    // DOM extraction
    try {
      const seen = new Set<string>();
      document.querySelectorAll('[class*="listing" i], [class*="ticket" i], li, tr, button[aria-label*="$"]').forEach((el) => {
        const text = el.textContent ?? el.getAttribute("aria-label") ?? "";
        const pm = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
        if (!pm) return;
        const price = parseFloat(pm[1].replace(/,/g, ""));
        if (!price || price < 5 || price > 100000) return;
        const key = `${price}-${text.substring(0, 30)}`;
        if (seen.has(key)) return;
        seen.add(key);

        const sm = text.match(/(?:Section|Sec\.?)\s+(\S+)/i);
        const rm = text.match(/Row\s+(\S+)/i);
        const qm = text.match(/(\d+)\s*(?:tickets?|seats?)/i);

        listings.push({
          price,
          section: sm ? sm[1] : "",
          row: rm ? rm[1] : "",
          quantity: qm ? parseInt(qm[1]) : 1,
          priceWithFees: price, // All-in pricing
          ticketsRemaining: qm ? parseInt(qm[1]) : null,
        });
      });
    } catch {}

    try {
      const bodyText = document.body.innerText;
      const tm = bodyText.match(/(\d+)\s*(?:tickets?|listings?)\s*(?:available|found|remaining)/i);
      if (tm) totalTicketsRemaining = parseInt(tm[1]);
      if (!totalTicketsRemaining && listings.length > 0) {
        const sum = listings.reduce((s, l) => s + (l.ticketsRemaining ?? 0), 0);
        if (sum > 0) totalTicketsRemaining = sum;
      }
    } catch {}

    return { listings, totalTicketsRemaining, eventName, venue, date };
  });
}
