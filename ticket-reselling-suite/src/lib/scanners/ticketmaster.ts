/**
 * Ticketmaster platform-specific scanner
 * Extracts ticket listings and availability from ticketmaster.com event pages.
 */

import type { Page } from "playwright";

export interface TicketmasterListing {
  section: string;
  row: string;
  price: number;
  quantity: number;
  priceWithFees: number | null;
  ticketsRemaining: number | null;
}

export interface TicketmasterScanResult {
  listings: TicketmasterListing[];
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

function isTMTicket(o: Record<string, unknown>): boolean {
  return (
    o.currentPrice !== undefined ||
    o.buyerPrice !== undefined ||
    o.rawPrice !== undefined ||
    o.faceValue !== undefined ||
    o.listPrice !== undefined ||
    (o.price !== undefined && (o.section !== undefined || o.sectionName !== undefined || o.areaName !== undefined)) ||
    (o.totalPrice !== undefined && o.section !== undefined)
  );
}

/**
 * Extract listings from Ticketmaster JSON API responses.
 */
export function extractTicketmasterFromJson(obj: unknown, depth = 0): TicketmasterListing[] {
  if (depth > 10 || !obj || typeof obj !== "object") return [];
  const results: TicketmasterListing[] = [];

  if (!Array.isArray(obj) && isTMTicket(obj as Record<string, unknown>)) {
    const o = obj as Record<string, unknown>;

    // Handle nested currentPrice: { amount: X }
    let price: number | null = null;
    if (o.currentPrice && typeof o.currentPrice === "object") {
      price = toNum((o.currentPrice as Record<string, unknown>).amount);
    }
    price = price ?? toNum(o.buyerPrice) ?? toNum(o.rawPrice) ?? toNum(o.listPrice)
      ?? toNum(o.faceValue) ?? toNum(o.price) ?? toNum(o.totalPrice);

    if (price && price > 0 && price < 100000) {
      let feesPrice: number | null = null;
      if (o.totalPrice !== undefined) feesPrice = toNum(o.totalPrice);
      if (o.buyerPrice !== undefined && o.rawPrice !== undefined) feesPrice = toNum(o.buyerPrice);

      results.push({
        price,
        section: String(o.section ?? o.sectionName ?? o.areaName ?? o.area ?? ""),
        row: String(o.row ?? o.rowName ?? o.seat ?? ""),
        quantity: toNum(o.quantityRemaining) ?? toNum(o.quantity) ?? toNum(o.available) ?? 1,
        priceWithFees: feesPrice,
        ticketsRemaining: toNum(o.quantityRemaining) ?? toNum(o.remaining) ?? toNum(o.available) ?? toNum(o.availableCount) ?? null,
      });
      return results;
    }
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      results.push(...extractTicketmasterFromJson(item, depth + 1));
    }
    return results;
  }

  const o = obj as Record<string, unknown>;
  const keysToCheck = [
    "offers", "resaleOffers", "_embedded", "prices", "priceRanges",
    "listings", "items", "data", "inventory", "ticketListings",
    "facets", "tickets", "results", "sections", "pageProps", "props",
    "initialData", "content", "body", "payload", "grid", "groups",
  ];
  for (const key of keysToCheck) {
    if (o[key] !== undefined) {
      results.push(...extractTicketmasterFromJson(o[key], depth + 1));
    }
  }

  return results;
}

/**
 * Extract listings from the rendered Ticketmaster DOM.
 */
export async function extractTicketmasterFromDom(page: Page): Promise<TicketmasterScanResult> {
  return page.evaluate(() => {
    const listings: Array<{
      section: string; row: string; price: number; quantity: number;
      priceWithFees: number | null; ticketsRemaining: number | null;
    }> = [];

    let eventName = "";
    let venue = "";
    let date = "";
    let totalTicketsRemaining: number | null = null;

    // Event info
    try {
      const h1 = document.querySelector("h1");
      eventName = h1?.textContent?.trim() ?? document.title;
      const venueEl = document.querySelector('[class*="venue" i], [class*="location" i], [data-testid*="venue"]');
      venue = venueEl?.textContent?.trim() ?? "";
      const dateEl = document.querySelector("time, [datetime], [class*=\"date\" i], [data-testid*=\"date\"]");
      date = dateEl?.getAttribute("datetime") ?? dateEl?.textContent?.trim() ?? "";
    } catch {}

    // Try __NEXT_DATA__
    try {
      const nd = document.getElementById("__NEXT_DATA__");
      if (nd?.textContent) {
        const data = JSON.parse(nd.textContent);
        const search = (obj: any, d: number): void => {
          if (d > 8 || !obj || typeof obj !== "object") return;
          if (Array.isArray(obj)) { obj.forEach((i: any) => search(i, d + 1)); return; }
          const price = parseFloat(String(obj.currentPrice?.amount ?? obj.buyerPrice ?? obj.rawPrice ?? obj.price ?? ""));
          if (price > 0 && price < 100000 && (obj.section || obj.sectionName || obj.areaName)) {
            listings.push({
              price,
              section: String(obj.section ?? obj.sectionName ?? obj.areaName ?? ""),
              row: String(obj.row ?? obj.rowName ?? ""),
              quantity: parseInt(obj.quantityRemaining ?? obj.quantity ?? "1") || 1,
              priceWithFees: parseFloat(String(obj.totalPrice ?? obj.buyerPrice ?? "")) || null,
              ticketsRemaining: parseInt(obj.quantityRemaining ?? obj.remaining ?? obj.available ?? "") || null,
            });
            return;
          }
          for (const k of Object.keys(obj)) search(obj[k], d + 1);
        };
        search(data, 0);
      }
    } catch {}

    // DOM price extraction
    try {
      const seen = new Set<string>();
      const priceEls = document.querySelectorAll('[data-testid*="price"], [class*="price" i], [class*="offer" i], [aria-label*="$"]');
      priceEls.forEach((el) => {
        const text = el.textContent?.trim() ?? el.getAttribute("aria-label") ?? "";
        const m = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
        if (!m) return;
        const price = parseFloat(m[1].replace(/,/g, ""));
        if (!price || price < 5 || price > 100000) return;
        const key = `${price}-${Math.round(el.getBoundingClientRect().y)}`;
        if (seen.has(key)) return;
        seen.add(key);

        const card = el.closest("li, tr, article, button, [role='listitem'], [class*='listing']") ?? el.parentElement?.parentElement;
        const ct = card?.textContent ?? "";
        const sm = ct.match(/(?:Section|Sec\.?)\s+(\S+)/i);
        const rm = ct.match(/Row\s+(\S+)/i);
        const qm = ct.match(/(\d+)\s*(?:tickets?|seats?)\s*(?:available|remaining|left)?/i);

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

    // Total tickets remaining
    try {
      const allText = document.body.innerText;
      const tm = allText.match(/(\d+)\s+(?:total\s+)?tickets?\s+(?:available|remaining)/i);
      if (tm) totalTicketsRemaining = parseInt(tm[1]);
      if (!totalTicketsRemaining && listings.length > 0) {
        const sum = listings.reduce((s, l) => s + (l.ticketsRemaining ?? 0), 0);
        if (sum > 0) totalTicketsRemaining = sum;
      }
    } catch {}

    return { listings, totalTicketsRemaining, eventName, venue, date };
  });
}
