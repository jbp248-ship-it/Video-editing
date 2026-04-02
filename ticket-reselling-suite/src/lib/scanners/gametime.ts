/**
 * Gametime platform-specific scanner
 * Gametime (gametime.co) is a mobile-first resale marketplace.
 * Known for last-minute ticket deals.
 */

import type { Page } from "playwright";

export interface GametimeListing {
  section: string;
  row: string;
  price: number;
  quantity: number;
  priceWithFees: number | null;
  ticketsRemaining: number | null;
}

export interface GametimeScanResult {
  listings: GametimeListing[];
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
 * Extract from Gametime JSON responses.
 */
export function extractGametimeFromJson(obj: unknown, depth = 0): GametimeListing[] {
  if (depth > 10 || !obj || typeof obj !== "object") return [];
  const results: GametimeListing[] = [];

  if (!Array.isArray(obj)) {
    const o = obj as Record<string, unknown>;
    const price = toNum(o.price) ?? toNum(o.totalPrice) ?? toNum(o.displayPrice) ??
      toNum(o.listPrice) ?? toNum(o.amount) ?? toNum(o.cost);

    if (price && price > 0 && price < 100000 &&
        (o.section !== undefined || o.sectionName !== undefined || o.zone !== undefined ||
         o.area !== undefined || o.row !== undefined)) {
      results.push({
        price,
        section: String(o.section ?? o.sectionName ?? o.zone ?? o.area ?? ""),
        row: String(o.row ?? o.rowName ?? o.seatRow ?? ""),
        quantity: toNum(o.quantity) ?? toNum(o.numTickets) ?? toNum(o.available) ?? toNum(o.seats) ?? 1,
        priceWithFees: toNum(o.totalPrice) ?? toNum(o.allInPrice) ?? toNum(o.priceWithFees) ?? null,
        ticketsRemaining: toNum(o.quantity) ?? toNum(o.numTickets) ?? toNum(o.available) ?? null,
      });
      return results;
    }
  }

  if (Array.isArray(obj)) {
    for (const item of obj) results.push(...extractGametimeFromJson(item, depth + 1));
    return results;
  }

  const o = obj as Record<string, unknown>;
  const keysToCheck = [
    "listings", "tickets", "offers", "items", "data", "results",
    "inventory", "content", "body", "payload", "groups",
    "pageProps", "props", "initialData",
  ];
  for (const key of keysToCheck) {
    if (o[key] !== undefined) results.push(...extractGametimeFromJson(o[key], depth + 1));
  }
  return results;
}

/**
 * Extract from Gametime's rendered DOM.
 */
export async function extractGametimeFromDom(page: Page): Promise<GametimeScanResult> {
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

    try {
      const seen = new Set<string>();
      document.querySelectorAll('[class*="listing" i], [class*="ticket" i], [class*="offer" i], li, tr, button[aria-label*="$"]').forEach((el) => {
        const text = el.textContent ?? el.getAttribute("aria-label") ?? "";
        const pm = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
        if (!pm) return;
        const price = parseFloat(pm[1].replace(/,/g, ""));
        if (!price || price < 5 || price > 100000) return;
        const key = `${price}-${text.substring(0, 30)}`;
        if (seen.has(key)) return;
        seen.add(key);

        const sm = text.match(/(?:Section|Sec\.?|Zone)\s+(\S+)/i);
        const rm = text.match(/Row\s+(\S+)/i);
        const qm = text.match(/(\d+)\s*(?:tickets?|seats?)/i);

        listings.push({
          price,
          section: sm ? sm[1] : "",
          row: rm ? rm[1] : "",
          quantity: qm ? parseInt(qm[1]) : 1,
          priceWithFees: null,
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
