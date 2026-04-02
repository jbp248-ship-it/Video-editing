import { Page } from "playwright";

export interface VividSeatsListing {
  section: string;
  row: string;
  price: number;
  quantity: number;
  priceWithFees: number | null;
  ticketsRemaining: number | null;
}

export interface VividSeatsScanResult {
  listings: VividSeatsListing[];
  totalTicketsRemaining: number | null;
  eventName: string;
  venue: string;
  date: string;
}

const MAX_RECURSION_DEPTH = 15;

/**
 * Recursively search a JSON object for VividSeats listing data.
 * Recognizes field names: price, listPrice, row, section, sectionName,
 * quantity, availableQuantity, ticketCount.
 * Listings may be nested under: listings, ticketGroups, groups, items, tickets.
 */
export function extractVividSeatsFromJson(
  obj: unknown,
  depth: number = 0
): VividSeatsListing[] {
  const results: VividSeatsListing[] = [];

  if (depth > MAX_RECURSION_DEPTH || obj === null || obj === undefined) {
    return results;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      try {
        results.push(...extractVividSeatsFromJson(item, depth + 1));
      } catch {
        // skip malformed items
      }
    }
    return results;
  }

  if (typeof obj !== "object") {
    return results;
  }

  const record = obj as Record<string, unknown>;

  // Check if this object itself looks like a listing
  if (isVividSeatsListingObject(record)) {
    try {
      const listing = parseVividSeatsListing(record);
      if (listing) {
        results.push(listing);
      }
    } catch {
      // skip unparseable listing
    }
  }

  // Recurse into known container keys first
  const containerKeys = [
    "listings",
    "ticketGroups",
    "groups",
    "items",
    "tickets",
  ];
  for (const key of containerKeys) {
    if (key in record && record[key] !== undefined) {
      try {
        results.push(
          ...extractVividSeatsFromJson(record[key], depth + 1)
        );
      } catch {
        // skip
      }
    }
  }

  // If no listings found in container keys, recurse all values
  if (results.length === 0) {
    for (const [key, value] of Object.entries(record)) {
      if (containerKeys.includes(key)) continue;
      if (typeof value === "object" && value !== null) {
        try {
          results.push(
            ...extractVividSeatsFromJson(value, depth + 1)
          );
        } catch {
          // skip
        }
      }
    }
  }

  return results;
}

function isVividSeatsListingObject(record: Record<string, unknown>): boolean {
  const hasPrice =
    "price" in record ||
    "listPrice" in record;
  const hasLocation =
    "section" in record ||
    "sectionName" in record ||
    "row" in record;
  return hasPrice && hasLocation;
}

function parseVividSeatsListing(
  record: Record<string, unknown>
): VividSeatsListing | null {
  const price = toNumber(record.price ?? record.listPrice);
  if (price === null || price <= 0) return null;

  const section = toString(record.sectionName ?? record.section) || "Unknown";
  const row = toString(record.row) || "GA";
  const quantity = toNumber(record.quantity ?? record.ticketCount) || 1;
  const priceWithFees = toNumber(record.priceWithFees ?? record.totalPrice) ?? null;
  const ticketsRemaining = toNumber(
    record.availableQuantity ?? record.ticketsRemaining ?? record.ticketCount
  );

  return {
    section,
    row,
    price,
    quantity,
    priceWithFees,
    ticketsRemaining,
  };
}

/**
 * Extract VividSeats listing data from a rendered page using DOM parsing
 * and __NEXT_DATA__ extraction.
 */
export async function extractVividSeatsFromDom(
  page: Page
): Promise<VividSeatsScanResult> {
  const result: VividSeatsScanResult = {
    listings: [],
    totalTicketsRemaining: null,
    eventName: "",
    venue: "",
    date: "",
  };

  // 1. Try extracting from __NEXT_DATA__ script tag
  try {
    const nextData = await page.evaluate(() => {
      const scriptEl = document.querySelector(
        'script#__NEXT_DATA__'
      );
      if (scriptEl && scriptEl.textContent) {
        return JSON.parse(scriptEl.textContent);
      }
      return null;
    });

    if (nextData) {
      const listings = extractVividSeatsFromJson(nextData);
      if (listings.length > 0) {
        result.listings.push(...listings);
      }

      // Try to extract event metadata from __NEXT_DATA__
      try {
        const props = nextData?.props?.pageProps;
        if (props) {
          result.eventName =
            toString(props.eventName ?? props.name ?? props.title) || "";
          result.venue =
            toString(props.venueName ?? props.venue?.name ?? props.venue) || "";
          result.date =
            toString(props.eventDate ?? props.date ?? props.dateTime) || "";
        }
      } catch {
        // metadata extraction is best-effort
      }
    }
  } catch {
    // __NEXT_DATA__ not available or unparseable
  }

  // 2. Try extracting from intercepted API responses embedded in window
  try {
    const windowData = await page.evaluate(() => {
      const win = window as unknown as Record<string, unknown>;
      const candidates: unknown[] = [];
      for (const key of Object.keys(win)) {
        if (
          key.startsWith("__") &&
          key !== "__NEXT_DATA__" &&
          typeof win[key] === "object"
        ) {
          candidates.push(win[key]);
        }
      }
      return candidates;
    });

    for (const data of windowData) {
      try {
        const listings = extractVividSeatsFromJson(data);
        if (listings.length > 0) {
          result.listings.push(...listings);
        }
      } catch {
        // skip
      }
    }
  } catch {
    // window data extraction failed
  }

  // 3. Fallback: parse rendered DOM for listing information
  if (result.listings.length === 0) {
    try {
      const domListings = await page.evaluate(() => {
        const extracted: Array<{
          section: string;
          row: string;
          price: number;
          quantity: number;
          priceWithFees: number | null;
          ticketsRemaining: number | null;
        }> = [];

        // Find all price elements matching $XX or $X,XXX patterns
        const allElements = document.querySelectorAll("*");
        const priceRegex = /\$[\d,]+(?:\.\d{2})?/;
        const ticketCountRegex = /(\d+)\s*(?:tickets?|remaining|available)/i;
        const sectionRegex = /(?:section|sec\.?)\s*([A-Za-z0-9]+)/i;
        const rowRegex = /(?:row|rw\.?)\s*([A-Za-z0-9]+)/i;

        // Look for listing card containers
        const listingCards = document.querySelectorAll(
          '[data-testid*="listing"], [class*="listing"], [class*="ticket-card"], [class*="TicketCard"], [class*="ticket-row"]'
        );

        const cards =
          listingCards.length > 0
            ? listingCards
            : document.querySelectorAll('[class*="row"], [class*="item"]');

        for (const card of cards) {
          const text = card.textContent || "";
          const priceMatch = text.match(priceRegex);
          if (!priceMatch) continue;

          const price = parseFloat(
            priceMatch[0].replace("$", "").replace(",", "")
          );
          if (isNaN(price) || price <= 0) continue;

          const sectionMatch = text.match(sectionRegex);
          const rowMatch = text.match(rowRegex);
          const ticketMatch = text.match(ticketCountRegex);

          extracted.push({
            section: sectionMatch ? sectionMatch[1] : "Unknown",
            row: rowMatch ? rowMatch[1] : "GA",
            price,
            quantity: ticketMatch ? parseInt(ticketMatch[1], 10) : 1,
            priceWithFees: null,
            ticketsRemaining: ticketMatch
              ? parseInt(ticketMatch[1], 10)
              : null,
          });
        }

        return extracted;
      });

      result.listings.push(...domListings);
    } catch {
      // DOM parsing failed
    }
  }

  // 4. Extract event metadata from DOM if not already set
  if (!result.eventName) {
    try {
      const meta = await page.evaluate(() => {
        const h1 = document.querySelector("h1");
        const eventName = h1?.textContent?.trim() || "";

        const ogTitle =
          document
            .querySelector('meta[property="og:title"]')
            ?.getAttribute("content") || "";

        // Look for venue info
        const venueEl = document.querySelector(
          '[class*="venue"], [data-testid*="venue"], [class*="location"]'
        );
        const venue = venueEl?.textContent?.trim() || "";

        // Look for date info
        const dateEl = document.querySelector(
          '[class*="date"], [data-testid*="date"], time'
        );
        const date =
          dateEl?.getAttribute("datetime") ||
          dateEl?.textContent?.trim() ||
          "";

        return {
          eventName: eventName || ogTitle,
          venue,
          date,
        };
      });

      result.eventName = result.eventName || meta.eventName;
      result.venue = result.venue || meta.venue;
      result.date = result.date || meta.date;
    } catch {
      // metadata extraction is best-effort
    }
  }

  // 5. Deduplicate listings by section+row+price
  result.listings = deduplicateListings(result.listings);

  // 6. Compute total tickets remaining
  const withRemaining = result.listings.filter(
    (l) => l.ticketsRemaining !== null
  );
  if (withRemaining.length > 0) {
    result.totalTicketsRemaining = withRemaining.reduce(
      (sum, l) => sum + (l.ticketsRemaining ?? 0),
      0
    );
  }

  return result;
}

function deduplicateListings(
  listings: VividSeatsListing[]
): VividSeatsListing[] {
  const seen = new Set<string>();
  const unique: VividSeatsListing[] = [];

  for (const listing of listings) {
    const key = `${listing.section}|${listing.row}|${listing.price}|${listing.quantity}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(listing);
    }
  }

  return unique;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

function toString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}
