/**
 * StubHub platform-specific scanner
 * StubHub is the most important resale platform — this scanner targets
 * their exact API field names and DOM structure.
 */

import type { Page } from "playwright";

export interface StubHubListing {
  section: string;
  row: string;
  price: number;
  quantity: number;
  priceWithFees: number | null;
  ticketsRemaining: number | null;
}

export interface StubHubScanResult {
  listings: StubHubListing[];
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

function isStubHubListing(o: Record<string, unknown>): boolean {
  return (
    o.RawPrice !== undefined ||
    o.rawPrice !== undefined ||
    o.DisplayPrice !== undefined ||
    o.displayPrice !== undefined ||
    o.PriceWithFees !== undefined ||
    o.priceWithFees !== undefined ||
    o.currentPrice !== undefined ||
    (o.price !== undefined && (o.section !== undefined || o.Section !== undefined))
  );
}

/**
 * Extract listings from StubHub JSON API responses.
 * StubHub uses PascalCase fields: RawPrice, Section, Row, MaxQuantity, PriceWithFees
 * and also camelCase: rawPrice, section, row, quantity, allInPrice
 */
export function extractStubHubFromJson(obj: unknown, depth = 0): StubHubListing[] {
  if (depth > 10 || !obj || typeof obj !== "object") return [];
  const results: StubHubListing[] = [];

  if (!Array.isArray(obj) && isStubHubListing(obj as Record<string, unknown>)) {
    const o = obj as Record<string, unknown>;
    const price =
      toNum(o.RawPrice) ?? toNum(o.rawPrice) ?? toNum(o.DisplayPrice) ??
      toNum(o.displayPrice) ?? toNum(o.currentPrice) ?? toNum(o.Price) ??
      toNum(o.price) ?? toNum(o.amount);

    if (price && price > 0 && price < 100000) {
      results.push({
        price,
        section: String(o.Section ?? o.section ?? o.SectionName ?? o.sectionName ?? o.ZoneName ?? o.zoneName ?? ""),
        row: String(o.Row ?? o.row ?? o.RowName ?? o.rowName ?? o.SeatRow ?? ""),
        quantity: toNum(o.MaxQuantity) ?? toNum(o.Quantity) ?? toNum(o.quantity) ?? toNum(o.maxQuantity) ?? toNum(o.AvailableQuantity) ?? 1,
        priceWithFees: toNum(o.PriceWithFees) ?? toNum(o.priceWithFees) ?? toNum(o.allInPrice) ?? toNum(o.TotalPrice) ?? null,
        ticketsRemaining: toNum(o.AvailableQuantity) ?? toNum(o.availableQuantity) ?? toNum(o.MaxQuantity) ?? toNum(o.maxQuantity) ?? toNum(o.Quantity) ?? null,
      });
      return results;
    }
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      results.push(...extractStubHubFromJson(item, depth + 1));
    }
    return results;
  }

  const o = obj as Record<string, unknown>;
  const keysToCheck = [
    "Items", "items", "listings", "listing", "tickets", "offers", "data",
    "results", "sections", "inventory", "ticketListings", "grid",
    "pageProps", "props", "initialData", "content", "body", "payload",
    "groups", "events", "search", "GridItems", "gridItems",
  ];
  for (const key of keysToCheck) {
    if (o[key] !== undefined) {
      results.push(...extractStubHubFromJson(o[key], depth + 1));
    }
  }

  return results;
}

/**
 * Extract listings from StubHub's rendered DOM.
 */
export async function extractStubHubFromDom(page: Page): Promise<StubHubScanResult> {
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
      const venueEl = document.querySelector('[class*="venue" i], [class*="location" i], [data-testid*="venue"]');
      venue = venueEl?.textContent?.trim() ?? "";
      const dateEl = document.querySelector("time, [datetime], [class*=\"date\" i], [data-testid*=\"date\"]");
      date = dateEl?.getAttribute("datetime") ?? dateEl?.textContent?.trim() ?? "";
    } catch {}

    // Try __NEXT_DATA__ (StubHub uses Next.js)
    try {
      const nd = document.getElementById("__NEXT_DATA__");
      if (nd?.textContent) {
        const data = JSON.parse(nd.textContent);
        const search = (obj: any, d: number): void => {
          if (d > 8 || !obj || typeof obj !== "object") return;
          if (Array.isArray(obj)) { obj.forEach((i: any) => search(i, d + 1)); return; }
          const price = parseFloat(String(obj.RawPrice ?? obj.rawPrice ?? obj.DisplayPrice ?? obj.displayPrice ?? obj.price ?? ""));
          if (price > 0 && price < 100000 && (obj.Section || obj.section || obj.SectionName)) {
            listings.push({
              price,
              section: String(obj.Section ?? obj.section ?? obj.SectionName ?? obj.sectionName ?? ""),
              row: String(obj.Row ?? obj.row ?? obj.RowName ?? ""),
              quantity: parseInt(obj.MaxQuantity ?? obj.Quantity ?? obj.quantity ?? "1") || 1,
              priceWithFees: parseFloat(String(obj.PriceWithFees ?? obj.priceWithFees ?? obj.allInPrice ?? "")) || null,
              ticketsRemaining: parseInt(obj.AvailableQuantity ?? obj.availableQuantity ?? obj.MaxQuantity ?? "") || null,
            });
            return;
          }
          for (const k of Object.keys(obj)) search(obj[k], d + 1);
        };
        search(data, 0);
      }
    } catch {}

    // DOM fallback — StubHub listing rows
    try {
      const seen = new Set<string>();
      document.querySelectorAll('[data-testid*="listing"], [class*="listing" i], [class*="ticket-card" i], li, tr, button[aria-label*="$"]').forEach((el) => {
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
          priceWithFees: null,
          ticketsRemaining: qm ? parseInt(qm[1]) : null,
        });
      });
    } catch {}

    // Total tickets
    try {
      const bodyText = document.body.innerText;
      const tm = bodyText.match(/(\d+)\s+(?:total\s+)?(?:tickets?|listings?)\s+(?:available|found|remaining)/i);
      if (tm) totalTicketsRemaining = parseInt(tm[1]);
      if (!totalTicketsRemaining && listings.length > 0) {
        const sum = listings.reduce((s, l) => s + (l.ticketsRemaining ?? 0), 0);
        if (sum > 0) totalTicketsRemaining = sum;
      }
    } catch {}

    return { listings, totalTicketsRemaining, eventName, venue, date };
  });
}
