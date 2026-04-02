import { Page } from "playwright";

export interface SeatGeekListing {
  section: string;
  row: string;
  price: number;
  quantity: number;
  priceWithFees: number | null;
  ticketsRemaining: number | null;
}

export interface SeatGeekScanResult {
  listings: SeatGeekListing[];
  totalTicketsRemaining: number | null;
  eventName: string;
  venue: string;
  date: string;
}

const MAX_RECURSION_DEPTH = 15;

/**
 * Recursively search a JSON object for SeatGeek listing data.
 * Recognizes both verbose field names (sectionName, rowName, seatCount, availableCount)
 * and compact API fields (s = section, r = row, q = quantity, dq = deal quality, sp = seller price).
 * Listings may be nested under: listings, data, listing_groups, offers.
 */
export function extractSeatGeekFromJson(
  obj: unknown,
  depth: number = 0
): SeatGeekListing[] {
  const results: SeatGeekListing[] = [];

  if (depth > MAX_RECURSION_DEPTH || obj === null || obj === undefined) {
    return results;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      try {
        results.push(...extractSeatGeekFromJson(item, depth + 1));
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
  if (isSeatGeekListingObject(record)) {
    try {
      const listing = parseSeatGeekListing(record);
      if (listing) {
        results.push(listing);
      }
    } catch {
      // skip unparseable listing
    }
  }

  // Check if the object has a nested "listing" key (SeatGeek wraps individual listings)
  if ("listing" in record && typeof record.listing === "object" && record.listing !== null) {
    try {
      const inner = record.listing as Record<string, unknown>;
      if (isSeatGeekListingObject(inner)) {
        const listing = parseSeatGeekListing(inner);
        if (listing) {
          results.push(listing);
        }
      }
    } catch {
      // skip
    }
  }

  // Recurse into known container keys first
  const containerKeys = ["listings", "data", "listing_groups", "offers"];
  for (const key of containerKeys) {
    if (key in record && record[key] !== undefined) {
      try {
        results.push(
          ...extractSeatGeekFromJson(record[key], depth + 1)
        );
      } catch {
        // skip
      }
    }
  }

  // If no listings found in container keys, recurse all values
  if (results.length === 0) {
    for (const [key, value] of Object.entries(record)) {
      if (containerKeys.includes(key) || key === "listing") continue;
      if (typeof value === "object" && value !== null) {
        try {
          results.push(
            ...extractSeatGeekFromJson(value, depth + 1)
          );
        } catch {
          // skip
        }
      }
    }
  }

  return results;
}

function isSeatGeekListingObject(record: Record<string, unknown>): boolean {
  // Verbose format
  const hasVerbosePrice = "price" in record;
  const hasVerboseLocation =
    "sectionName" in record || "rowName" in record || "section" in record;

  // Compact API format (s = section, r = row, q = quantity)
  const hasCompactPrice = "price" in record || "sp" in record;
  const hasCompactLocation = "s" in record || "r" in record;

  return (
    (hasVerbosePrice && hasVerboseLocation) ||
    (hasCompactPrice && hasCompactLocation)
  );
}

function parseSeatGeekListing(
  record: Record<string, unknown>
): SeatGeekListing | null {
  // Price: prefer "price", fall back to "sp" (seller price)
  const price = toNumber(record.price ?? record.sp);
  if (price === null || price <= 0) return null;

  // Section: verbose then compact
  const section =
    toString(record.sectionName ?? record.section ?? record.s) || "Unknown";

  // Row: verbose then compact
  const row = toString(record.rowName ?? record.row ?? record.r) || "GA";

  // Quantity: verbose then compact
  const quantity =
    toNumber(record.quantity ?? record.seatCount ?? record.q) || 1;

  // Price with fees
  const priceWithFees =
    toNumber(record.priceWithFees ?? record.totalPrice) ?? null;

  // Tickets remaining
  const ticketsRemaining = toNumber(
    record.availableCount ??
      record.ticketsRemaining ??
      record.seatCount ??
      record.q
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
 * Extract SeatGeek listing data from a rendered page using DOM parsing
 * and __NEXT_DATA__ extraction.
 */
export async function extractSeatGeekFromDom(
  page: Page
): Promise<SeatGeekScanResult> {
  const result: SeatGeekScanResult = {
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
      const listings = extractSeatGeekFromJson(nextData);
      if (listings.length > 0) {
        result.listings.push(...listings);
      }

      // Try to extract event metadata from __NEXT_DATA__
      try {
        const props = nextData?.props?.pageProps;
        if (props) {
          result.eventName =
            toString(
              props.eventName ?? props.event?.name ?? props.title ?? props.name
            ) || "";
          result.venue =
            toString(
              props.venueName ??
                props.venue?.name ??
                props.event?.venue?.name ??
                props.venue
            ) || "";
          result.date =
            toString(
              props.eventDate ??
                props.event?.datetime_utc ??
                props.date ??
                props.dateTime
            ) || "";
        }
      } catch {
        // metadata extraction is best-effort
      }
    }
  } catch {
    // __NEXT_DATA__ not available or unparseable
  }

  // 2. Try extracting from window-level data objects (React hydration state)
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
        const listings = extractSeatGeekFromJson(data);
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

        const priceRegex = /\$[\d,]+(?:\.\d{2})?/;
        const ticketCountRegex =
          /(\d+)\s*(?:tickets?|remaining|available|left)/i;
        const sectionRegex = /(?:section|sec\.?)\s*([A-Za-z0-9]+)/i;
        const rowRegex = /(?:row|rw\.?)\s*([A-Za-z0-9]+)/i;

        // SeatGeek listing selectors
        const listingCards = document.querySelectorAll(
          '[data-testid*="listing"], [class*="listing"], [class*="ListingCard"], [class*="TicketListing"], [class*="ticket-row"], [class*="offer"]'
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

        // SeatGeek venue info
        const venueEl = document.querySelector(
          '[class*="venue"], [data-testid*="venue"], [class*="location"], [class*="Venue"]'
        );
        const venue = venueEl?.textContent?.trim() || "";

        // Date info
        const dateEl = document.querySelector(
          '[class*="date"], [data-testid*="date"], time, [class*="Date"]'
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
  listings: SeatGeekListing[]
): SeatGeekListing[] {
  const seen = new Set<string>();
  const unique: SeatGeekListing[] = [];

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
