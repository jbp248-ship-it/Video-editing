/**
 * Etix Platform-Specific Scanner
 *
 * Extracts ticket listings and remaining ticket counts from etix.com event pages.
 *
 * Etix uses server-rendered HTML with price tiers displayed as cards/rows.
 * URLs follow the pattern: https://www.etix.com/ticket/p/XXXXXXX/event-name
 *
 * This scanner handles two extraction strategies:
 * 1. JSON extraction from intercepted network responses (API data)
 * 2. DOM extraction from the rendered page (server-rendered HTML)
 */

import type { Page } from "playwright";

/** A single ticket listing extracted from Etix. */
export interface EtixListing {
  /** Section or tier name (e.g. "General Admission", "VIP", "Floor") */
  section: string;
  /** Row identifier, if applicable */
  row: string;
  /** Base ticket price in dollars */
  price: number;
  /** Number of tickets available at this price/section */
  quantity: number;
  /** Total price including service and facility fees, if available */
  priceWithFees: number | null;
  /** How many tickets remain for this tier/section, if known */
  ticketsRemaining: number | null;
}

/** Full scan result from an Etix event page. */
export interface EtixScanResult {
  /** All extracted ticket listings */
  listings: EtixListing[];
  /** Total tickets remaining across all tiers, if determinable */
  totalTicketsRemaining: number | null;
  /** Event name/title */
  eventName: string;
  /** Venue name */
  venue: string;
  /** Event date string */
  date: string;
}

/**
 * Convert an unknown value to a number, stripping currency symbols and commas.
 * Returns null if the value cannot be parsed or is out of range.
 */
function toNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return isFinite(val) ? val : null;
  const cleaned = String(val).replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Check whether a JSON object looks like an Etix ticket/price-tier object.
 * Etix uses different field naming conventions than StubHub.
 */
function isEtixTicketObject(obj: Record<string, unknown>): boolean {
  const hasPrice =
    obj.ticketPrice !== undefined ||
    obj.price !== undefined ||
    obj.faceValue !== undefined ||
    obj.totalPrice !== undefined ||
    obj.amount !== undefined ||
    obj.cost !== undefined ||
    obj.basePrice !== undefined;

  const hasIdentifier =
    obj.sectionName !== undefined ||
    obj.section !== undefined ||
    obj.rowName !== undefined ||
    obj.row !== undefined ||
    obj.tierName !== undefined ||
    obj.tier !== undefined ||
    obj.name !== undefined ||
    obj.label !== undefined ||
    obj.category !== undefined ||
    obj.type !== undefined ||
    obj.ticketType !== undefined ||
    obj.priceLevelName !== undefined;

  return hasPrice && hasIdentifier;
}

/**
 * Compute the total price including fees from an Etix ticket object.
 * Etix often breaks out service fees and facility fees separately.
 */
function computePriceWithFees(obj: Record<string, unknown>): number | null {
  // If a totalPrice or allInPrice is provided, use it directly
  const total =
    toNumber(obj.totalPrice) ??
    toNumber(obj.allInPrice) ??
    toNumber(obj.priceWithFees);
  if (total !== null && total > 0) return total;

  // Otherwise, sum base price + fees
  const base =
    toNumber(obj.ticketPrice) ??
    toNumber(obj.price) ??
    toNumber(obj.faceValue) ??
    toNumber(obj.basePrice);
  if (base === null) return null;

  const serviceFee = toNumber(obj.serviceFee) ?? toNumber(obj.serviceCharge) ?? 0;
  const facilityFee = toNumber(obj.facilityFee) ?? toNumber(obj.facilityCharge) ?? 0;
  const orderFee = toNumber(obj.orderFee) ?? toNumber(obj.processingFee) ?? 0;

  const sum = base + serviceFee + facilityFee + orderFee;
  return sum > base ? sum : null;
}

/**
 * Extract the number of remaining tickets from an Etix ticket object.
 */
function extractRemaining(obj: Record<string, unknown>): number | null {
  return (
    toNumber(obj.available) ??
    toNumber(obj.remaining) ??
    toNumber(obj.availableCount) ??
    toNumber(obj.inventory) ??
    toNumber(obj.qty) ??
    toNumber(obj.maxQty) ??
    toNumber(obj.limit) ??
    toNumber(obj.ticketsRemaining) ??
    toNumber(obj.remainingCount) ??
    toNumber(obj.seatsAvailable) ??
    null
  );
}

/**
 * Extract the section/tier name from an Etix ticket object.
 */
function extractSection(obj: Record<string, unknown>): string {
  return String(
    obj.sectionName ??
    obj.section ??
    obj.tierName ??
    obj.tier ??
    obj.name ??
    obj.label ??
    obj.category ??
    obj.ticketType ??
    obj.priceLevelName ??
    obj.type ??
    ""
  );
}

/**
 * Extract the row identifier from an Etix ticket object.
 */
function extractRow(obj: Record<string, unknown>): string {
  return String(
    obj.rowName ??
    obj.row ??
    obj.rowLabel ??
    obj.seatRow ??
    ""
  );
}

/**
 * Recursively extract Etix ticket listings from a JSON structure.
 *
 * Etix API responses may nest ticket data under various keys such as
 * `tickets`, `priceLevels`, `sections`, `tiers`, `inventory`,
 * `availability`, `priceCategories`, or `ticketTypes`.
 *
 * @param obj - The JSON object (or array) to search
 * @param depth - Current recursion depth (max 8)
 * @returns Array of extracted EtixListing objects
 */
export function extractEtixFromJson(obj: unknown, depth = 0): EtixListing[] {
  if (depth > 8 || !obj || typeof obj !== "object") return [];

  const results: EtixListing[] = [];

  // Check if this object itself is a ticket listing
  if (!Array.isArray(obj) && isEtixTicketObject(obj as Record<string, unknown>)) {
    const o = obj as Record<string, unknown>;
    const price =
      toNumber(o.ticketPrice) ??
      toNumber(o.price) ??
      toNumber(o.faceValue) ??
      toNumber(o.basePrice) ??
      toNumber(o.totalPrice) ??
      toNumber(o.amount) ??
      toNumber(o.cost);

    if (price && price > 0 && price < 100000) {
      results.push({
        price,
        section: extractSection(o),
        row: extractRow(o),
        quantity:
          toNumber(o.quantity) ??
          toNumber(o.maxQuantity) ??
          toNumber(o.maxQty) ??
          toNumber(o.qty) ??
          1,
        priceWithFees: computePriceWithFees(o),
        ticketsRemaining: extractRemaining(o),
      });
      return results;
    }
  }

  // Recurse into arrays
  if (Array.isArray(obj)) {
    for (const item of obj) {
      results.push(...extractEtixFromJson(item, depth + 1));
    }
    return results;
  }

  // Recurse into known container keys
  const o = obj as Record<string, unknown>;
  const keysToCheck = [
    // Etix-specific keys
    "tickets",
    "priceLevels",
    "sections",
    "tiers",
    "inventory",
    "availability",
    "priceCategories",
    "ticketTypes",
    // Generic container keys
    "data",
    "results",
    "items",
    "listings",
    "offers",
    "content",
    "body",
    "payload",
    "pageProps",
    "props",
    "initialData",
    "response",
    "event",
    "eventDetails",
    "ticketInfo",
    "pricing",
    "prices",
    "levels",
    "categories",
  ];

  for (const key of keysToCheck) {
    if (o[key] !== undefined) {
      results.push(...extractEtixFromJson(o[key], depth + 1));
    }
  }

  return results;
}

/**
 * Extract ticket listings and event info from the rendered Etix DOM.
 *
 * Etix pages are largely server-rendered, so DOM extraction is often
 * the primary data source. This function looks for:
 * - Price elements via class selectors and dollar-sign text patterns
 * - Remaining ticket counts via "X tickets remaining" text
 * - Event metadata (name, venue, date) from standard heading/meta elements
 * - Section/tier names from card or row groupings
 *
 * @param page - Playwright Page instance with the Etix event page loaded
 * @returns Extracted scan result with listings and event info
 */
export async function extractEtixFromDom(page: Page): Promise<EtixScanResult> {
  return page.evaluate(() => {
    const listings: Array<{
      section: string;
      row: string;
      price: number;
      quantity: number;
      priceWithFees: number | null;
      ticketsRemaining: number | null;
    }> = [];
    const seen = new Set<string>();

    // ---- Helpers ----

    function parsePrice(text: string): number | null {
      const cleaned = text.replace(/[^0-9.]/g, "");
      const num = parseFloat(cleaned);
      return isNaN(num) || num <= 0 || num > 100000 ? null : num;
    }

    function parseRemainingFromText(text: string): number | null {
      // "12 tickets remaining", "5 left", "3 tickets available", "8 remaining"
      const match = text.match(/(\d+)\s*(?:tickets?\s*)?(?:left|remaining|available)/i);
      if (match) return parseInt(match[1], 10);
      return null;
    }

    function parseAvailabilityStatus(text: string): number | null {
      const lower = text.toLowerCase().trim();
      if (lower === "sold out" || lower.includes("sold out")) return 0;
      if (lower === "limited" || lower.includes("limited availability") || lower.includes("few left")) return -1; // -1 = limited but unknown count
      return null;
    }

    function extractSectionName(text: string): string {
      // Common Etix section/tier names
      const patterns = [
        /General\s*Admission/i,
        /GA/,
        /VIP/i,
        /Floor/i,
        /Balcony/i,
        /Mezzanine/i,
        /Orchestra/i,
        /Reserved/i,
        /Standing/i,
        /Pit/i,
        /Lawn/i,
        /Box/i,
        /Tier\s*\d*/i,
        /Level\s*\d*/i,
        /Section\s*\S+/i,
      ];
      for (const pat of patterns) {
        const m = text.match(pat);
        if (m) return m[0].trim();
      }
      return "";
    }

    // ---- Event Info Extraction ----

    let eventName = "";
    let venue = "";
    let date = "";

    try {
      const h1 = document.querySelector("h1");
      eventName = h1?.textContent?.trim() ?? document.title ?? "";

      // Clean platform suffixes
      eventName = eventName
        .replace(/\s*[-|·]\s*(?:Etix|Buy Tickets).*$/i, "")
        .replace(/\s*Tickets?\s*$/i, "")
        .trim();
    } catch {
      // ignore
    }

    try {
      const venueEl = document.querySelector(
        '[class*="venue" i], [class*="location" i], [class*="place" i], ' +
        '[data-testid*="venue"], [itemprop="location"], .venue-name, .venue'
      );
      if (venueEl) venue = venueEl.textContent?.trim() ?? "";
    } catch {
      // ignore
    }

    try {
      const dateEl = document.querySelector(
        'time, [datetime], [class*="date" i], [itemprop="startDate"], ' +
        '[data-testid*="date"], .event-date, .date'
      );
      if (dateEl) {
        date =
          dateEl.getAttribute("datetime") ??
          dateEl.getAttribute("content") ??
          dateEl.textContent?.trim() ??
          "";
      }
    } catch {
      // ignore
    }

    // ---- Strategy 1: Tier/price cards and rows ----

    try {
      const tierSelectors = [
        '[class*="price" i]',
        '[class*="cost" i]',
        '[class*="tier" i]',
        '[class*="level" i]',
        '[class*="ticket-type" i]',
        ".price-row",
        ".ticket-row",
        "tr",
        '[class*="ticket-type"]',
        '[class*="price-level"]',
        '[class*="price-category"]',
        '[class*="ticket-option"]',
        '[class*="ticket-tier"]',
      ];

      const candidateElements = document.querySelectorAll(tierSelectors.join(", "));

      candidateElements.forEach((el) => {
        try {
          const text = el.textContent ?? "";
          if (!text || el.closest("header, footer, nav, script, style")) return;

          // Look for a price in this element
          const priceMatch = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
          if (!priceMatch) return;

          const price = parsePrice(priceMatch[1]);
          if (!price || price < 1) return;

          // Dedup by element position
          const rect = el.getBoundingClientRect();
          const key = `tier-${Math.round(rect.x)}-${Math.round(rect.y)}-${price}`;
          if (seen.has(key)) return;
          seen.add(key);

          // Look for a second price (fees-included price)
          const allPrices = text.match(/\$\s?[\d,]+(?:\.\d{2})?/g) ?? [];
          let priceWithFees: number | null = null;
          if (allPrices.length >= 2) {
            const parsed = allPrices
              .map((p) => parsePrice(p))
              .filter((p): p is number => p !== null)
              .sort((a, b) => a - b);
            // The higher price is likely the fees-included price
            if (parsed.length >= 2 && parsed[parsed.length - 1] > parsed[0]) {
              priceWithFees = parsed[parsed.length - 1];
            }
          }

          // Extract remaining count
          const remaining = parseRemainingFromText(text);
          const status = remaining === null ? parseAvailabilityStatus(text) : null;
          const ticketsRemaining = remaining ?? (status === 0 ? 0 : null);

          // Extract section name
          const section = extractSectionName(text);

          // Extract row
          const rowMatch = text.match(/Row\s+(\S+)/i);
          const row = rowMatch ? rowMatch[1] : "";

          // Extract quantity from quantity selectors
          let quantity = 1;
          const qtySelect = el.querySelector("select, input[type='number']");
          if (qtySelect) {
            const options = qtySelect.querySelectorAll("option");
            if (options.length > 0) {
              const lastOption = options[options.length - 1];
              const maxQty = parseInt(lastOption.textContent?.trim() ?? "", 10);
              if (!isNaN(maxQty) && maxQty > 0) quantity = maxQty;
            } else {
              const max = qtySelect.getAttribute("max");
              if (max) {
                const maxVal = parseInt(max, 10);
                if (!isNaN(maxVal) && maxVal > 0) quantity = maxVal;
              }
            }
          }

          // Skip sold-out tiers from listings (but we already captured remaining=0)
          if (status === 0) return;

          listings.push({
            price,
            section,
            row,
            quantity,
            priceWithFees,
            ticketsRemaining,
          });
        } catch {
          // Skip this element on error
        }
      });
    } catch {
      // Strategy 1 failed, continue to next
    }

    // ---- Strategy 2: Walk all dollar-sign text nodes ----

    try {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node: Text) {
            const t = node.textContent?.trim() ?? "";
            return /\$\s?[\d,]+(?:\.\d{2})?/.test(t)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP;
          },
        }
      );

      let textNode: Text | null;
      while ((textNode = walker.nextNode() as Text | null)) {
        try {
          const nodeText = textNode.textContent?.trim() ?? "";
          const priceMatch = nodeText.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
          if (!priceMatch) continue;

          const price = parsePrice(priceMatch[1]);
          if (!price || price < 5) continue;

          const el = textNode.parentElement;
          if (!el) continue;

          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;

          const key = `text-${Math.round(rect.x)}-${Math.round(rect.y)}-${price}`;
          if (seen.has(key)) continue;
          seen.add(key);

          if (el.closest("header, footer, nav, script, style")) continue;

          // Find the containing card/row
          const card =
            el.closest(
              'li, tr, article, [role="listitem"], [class*="tier"], ' +
              '[class*="ticket"], [class*="price"], [class*="row"], ' +
              '[class*="card"], [class*="option"], .ticket-type'
            ) ?? el.parentElement?.parentElement?.parentElement;

          const cardText = card?.textContent ?? "";
          const section = extractSectionName(cardText);
          const rowMatch = cardText.match(/Row\s+(\S+)/i);
          const remaining = parseRemainingFromText(cardText);

          listings.push({
            price,
            section,
            row: rowMatch ? rowMatch[1] : "",
            quantity: 1,
            priceWithFees: null,
            ticketsRemaining: remaining,
          });
        } catch {
          // Skip this node
        }
      }
    } catch {
      // Strategy 2 failed
    }

    // ---- Strategy 3: aria-labels and data attributes ----

    try {
      const attrEls = document.querySelectorAll(
        "[aria-label*='$'], [data-price], [data-amount], " +
        "[data-ticket-price], [data-face-value]"
      );

      attrEls.forEach((el) => {
        try {
          const text =
            el.getAttribute("aria-label") ??
            el.getAttribute("data-price") ??
            el.getAttribute("data-amount") ??
            el.getAttribute("data-ticket-price") ??
            el.getAttribute("data-face-value") ??
            "";

          const match = text.match(/\$?\s?([\d,]+(?:\.\d{2})?)/);
          if (!match) return;

          const price = parsePrice(match[1]);
          if (!price || price < 1) return;

          const key = `attr-${text.substring(0, 50)}-${price}`;
          if (seen.has(key)) return;
          seen.add(key);

          const fullText = el.textContent ?? "";
          const section = extractSectionName(fullText);
          const rowMatch = fullText.match(/Row\s+(\S+)/i);
          const remaining = parseRemainingFromText(fullText);

          listings.push({
            price,
            section,
            row: rowMatch ? rowMatch[1] : "",
            quantity: 1,
            priceWithFees: null,
            ticketsRemaining: remaining,
          });
        } catch {
          // Skip
        }
      });
    } catch {
      // Strategy 3 failed
    }

    // ---- Compute total remaining ----

    let totalTicketsRemaining: number | null = null;

    // First, check for a page-level total remaining indicator
    try {
      const bodyText = document.body.innerText;
      const totalMatch = bodyText.match(
        /(\d+)\s*(?:total\s*)?tickets?\s*(?:remaining|available|left)/i
      );
      if (totalMatch) {
        totalTicketsRemaining = parseInt(totalMatch[1], 10);
      }
    } catch {
      // ignore
    }

    // If no page-level total, sum up per-tier remaining counts
    if (totalTicketsRemaining === null) {
      const knownCounts = listings
        .map((l) => l.ticketsRemaining)
        .filter((r): r is number => r !== null && r > 0);
      if (knownCounts.length > 0) {
        totalTicketsRemaining = knownCounts.reduce((a, b) => a + b, 0);
      }
    }

    return {
      listings,
      totalTicketsRemaining,
      eventName,
      venue,
      date,
    };
  });
}
