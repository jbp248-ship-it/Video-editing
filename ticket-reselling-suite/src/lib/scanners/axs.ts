/**
 * AXS platform-specific scanner
 * AXS (axs.com) is a primary ticket seller for many venues (AEG-affiliated).
 * They sell primary tickets (not resale), so "tickets remaining" is key data.
 */

import type { Page } from "playwright";

export interface AXSListing {
  section: string;
  row: string;
  price: number;
  quantity: number;
  priceWithFees: number | null;
  ticketsRemaining: number | null;
}

export interface AXSScanResult {
  listings: AXSListing[];
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
 * Extract from AXS JSON API responses.
 * AXS uses fields like: price, faceValue, serviceFee, facilityFee,
 * sectionName, rowName, availableCount, maxQuantity, priceLevel
 */
export function extractAXSFromJson(obj: unknown, depth = 0): AXSListing[] {
  if (depth > 10 || !obj || typeof obj !== "object") return [];
  const results: AXSListing[] = [];

  if (!Array.isArray(obj)) {
    const o = obj as Record<string, unknown>;
    const price = toNum(o.price) ?? toNum(o.faceValue) ?? toNum(o.ticketPrice) ??
      toNum(o.totalPrice) ?? toNum(o.displayPrice) ?? toNum(o.amount);

    if (price && price > 0 && price < 100000 &&
        (o.sectionName !== undefined || o.section !== undefined || o.priceLevelName !== undefined ||
         o.priceLevel !== undefined || o.tierName !== undefined || o.categoryName !== undefined)) {
      const serviceFee = toNum(o.serviceFee) ?? toNum(o.fees) ?? 0;
      const facilityFee = toNum(o.facilityFee) ?? 0;
      const totalWithFees = toNum(o.totalPrice) ?? (serviceFee || facilityFee ? price + serviceFee + facilityFee : null);

      results.push({
        price,
        section: String(o.sectionName ?? o.section ?? o.priceLevelName ?? o.priceLevel ?? o.tierName ?? o.categoryName ?? ""),
        row: String(o.rowName ?? o.row ?? o.seatRow ?? ""),
        quantity: toNum(o.maxQuantity) ?? toNum(o.quantity) ?? toNum(o.available) ?? 1,
        priceWithFees: totalWithFees,
        ticketsRemaining: toNum(o.availableCount) ?? toNum(o.available) ?? toNum(o.remaining) ?? toNum(o.inventory) ?? toNum(o.maxQuantity) ?? null,
      });
      return results;
    }
  }

  if (Array.isArray(obj)) {
    for (const item of obj) results.push(...extractAXSFromJson(item, depth + 1));
    return results;
  }

  const o = obj as Record<string, unknown>;
  const keysToCheck = [
    "priceLevels", "sections", "tiers", "tickets", "inventory",
    "availability", "offers", "items", "data", "results", "listings",
    "priceCategories", "ticketTypes", "content", "body", "payload",
    "pageProps", "props", "initialData",
  ];
  for (const key of keysToCheck) {
    if (o[key] !== undefined) results.push(...extractAXSFromJson(o[key], depth + 1));
  }
  return results;
}

/**
 * Extract from AXS rendered DOM.
 */
export async function extractAXSFromDom(page: Page): Promise<AXSScanResult> {
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
      const h1 = document.querySelector("h1, [class*='event-name' i], [class*='eventName' i]");
      eventName = h1?.textContent?.trim() ?? document.title;
      const venueEl = document.querySelector('[class*="venue" i], [class*="location" i]');
      venue = venueEl?.textContent?.trim() ?? "";
      const dateEl = document.querySelector("time, [datetime], [class*='date' i]");
      date = dateEl?.getAttribute("datetime") ?? dateEl?.textContent?.trim() ?? "";
    } catch {}

    // AXS typically shows price tiers/levels
    try {
      const seen = new Set<string>();
      const tierEls = document.querySelectorAll(
        '[class*="price-level" i], [class*="tier" i], [class*="ticket-type" i], ' +
        '[class*="price-row" i], [class*="offer" i], tr, li, [role="listitem"]'
      );
      tierEls.forEach((el) => {
        const text = el.textContent ?? "";
        const pm = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
        if (!pm) return;
        const price = parseFloat(pm[1].replace(/,/g, ""));
        if (!price || price < 3 || price > 100000) return;
        const key = `${price}-${text.substring(0, 40)}`;
        if (seen.has(key)) return;
        seen.add(key);

        // Section/tier name
        const sm = text.match(/(?:Section|Sec\.?|Level|Tier|Category)\s+([^\n$]+?)(?:\s*[-–—]\s*|\s*\$)/i);
        const rm = text.match(/Row\s+(\S+)/i);
        const qm = text.match(/(\d+)\s*(?:tickets?|seats?|available|remaining|left)/i);

        // Get tier/level name from parent
        let sectionName = sm ? sm[1].trim() : "";
        if (!sectionName) {
          const nameEl = el.querySelector('[class*="name" i], [class*="title" i], [class*="label" i]');
          if (nameEl) sectionName = nameEl.textContent?.trim() ?? "";
        }

        listings.push({
          price,
          section: sectionName,
          row: rm ? rm[1] : "",
          quantity: qm ? parseInt(qm[1]) : 1,
          priceWithFees: null,
          ticketsRemaining: qm ? parseInt(qm[1]) : null,
        });
      });
    } catch {}

    // Remaining count
    try {
      const bodyText = document.body.innerText;
      const tm = bodyText.match(/(\d+)\s*(?:tickets?|seats?)\s*(?:available|remaining|left)/i);
      if (tm) totalTicketsRemaining = parseInt(tm[1]);
      if (!totalTicketsRemaining && listings.length > 0) {
        const sum = listings.reduce((s, l) => s + (l.ticketsRemaining ?? 0), 0);
        if (sum > 0) totalTicketsRemaining = sum;
      }

      // Check for "Sold Out"
      if (bodyText.match(/sold\s*out/i) && listings.length === 0) {
        totalTicketsRemaining = 0;
      }
    } catch {}

    return { listings, totalTicketsRemaining, eventName, venue, date };
  });
}
