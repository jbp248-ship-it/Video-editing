/**
 * Email Parsing Engine for Automated Sales Tracking
 *
 * Strategy: Use Postmark (or SendGrid) inbound email parsing.
 * 1. Set up a dedicated email address (e.g., sales@yourdomain.com)
 * 2. Forward all sale confirmation emails from platforms to this address
 * 3. Postmark sends a webhook with parsed email data
 * 4. This module extracts sale details from the email body
 *
 * Each platform has distinct email patterns for sale confirmations.
 */

export interface ParsedSale {
  platform: string;
  eventName: string;
  section: string | null;
  row: string | null;
  seats: string | null;
  quantity: number;
  salePrice: number;
  buyerOrderId: string | null;
  confidence: "high" | "medium" | "low";
  rawText: string;
}

// ─── Platform-Specific Parsers ─────────────────────────────────────────────

const platformParsers: Record<
  string,
  {
    detect: (from: string, subject: string) => boolean;
    parse: (body: string, subject: string) => Partial<ParsedSale> | null;
  }
> = {
  STUBHUB: {
    detect(from, subject) {
      return (
        from.toLowerCase().includes("stubhub") &&
        (subject.toLowerCase().includes("your sale") ||
          subject.toLowerCase().includes("order confirmed") ||
          subject.toLowerCase().includes("you sold"))
      );
    },

    parse(body) {
      const result: Partial<ParsedSale> = { platform: "STUBHUB" };

      // StubHub sale confirmation pattern:
      // "Event: Taylor Swift | The Eras Tour"
      // "Section: 128, Row: A, Seats: 1-2"
      // "Sale Price: $450.00 per ticket"
      // "Quantity: 2"
      // "Order #: 123456789"

      const eventMatch = body.match(
        /Event:\s*(.+?)(?:\n|\r|Section:|$)/i
      );
      if (eventMatch) result.eventName = eventMatch[1].trim();

      const sectionMatch = body.match(/Section:\s*(\S+)/i);
      if (sectionMatch) result.section = sectionMatch[1].replace(/,/g, "");

      const rowMatch = body.match(/Row:\s*(\S+)/i);
      if (rowMatch) result.row = rowMatch[1].replace(/,/g, "");

      const seatMatch = body.match(/Seats?:\s*(\S+)/i);
      if (seatMatch) result.seats = seatMatch[1];

      const priceMatch = body.match(/(?:Sale )?Price:\s*\$?([\d,.]+)/i);
      if (priceMatch)
        result.salePrice = parseFloat(priceMatch[1].replace(/,/g, ""));

      const qtyMatch = body.match(/Quantity:\s*(\d+)/i);
      if (qtyMatch) result.quantity = parseInt(qtyMatch[1], 10);

      const orderMatch = body.match(/Order\s*#?:?\s*(\d+)/i);
      if (orderMatch) result.buyerOrderId = orderMatch[1];

      result.confidence =
        result.eventName && result.salePrice ? "high" : "medium";

      return result;
    },
  },

  TICKETMASTER: {
    detect(from, subject) {
      return (
        from.toLowerCase().includes("ticketmaster") &&
        (subject.toLowerCase().includes("sold") ||
          subject.toLowerCase().includes("sale confirmation"))
      );
    },

    parse(body) {
      const result: Partial<ParsedSale> = { platform: "TICKETMASTER" };

      // Ticketmaster uses slightly different patterns
      const eventMatch = body.match(
        /(?:Event|Show):\s*(.+?)(?:\n|\r|Date:|$)/i
      );
      if (eventMatch) result.eventName = eventMatch[1].trim();

      const sectionMatch = body.match(/Sec(?:tion)?\.?\s*(\S+)/i);
      if (sectionMatch) result.section = sectionMatch[1].replace(/,/g, "");

      const rowMatch = body.match(/Row\s*(\S+)/i);
      if (rowMatch) result.row = rowMatch[1].replace(/,/g, "");

      const priceMatch = body.match(
        /(?:Sale|Sold)\s*(?:Price|Amount):\s*\$?([\d,.]+)/i
      );
      if (priceMatch)
        result.salePrice = parseFloat(priceMatch[1].replace(/,/g, ""));

      const qtyMatch = body.match(/(?:Qty|Quantity):\s*(\d+)/i);
      if (qtyMatch) result.quantity = parseInt(qtyMatch[1], 10);

      const orderMatch = body.match(
        /(?:Order|Confirmation)\s*#?:?\s*([A-Z0-9-]+)/i
      );
      if (orderMatch) result.buyerOrderId = orderMatch[1];

      result.confidence =
        result.eventName && result.salePrice ? "high" : "medium";

      return result;
    },
  },

  VIVID_SEATS: {
    detect(from, subject) {
      return (
        from.toLowerCase().includes("vividseats") &&
        subject.toLowerCase().includes("sale")
      );
    },

    parse(body) {
      const result: Partial<ParsedSale> = { platform: "VIVID_SEATS" };

      const eventMatch = body.match(/Event:\s*(.+?)(?:\n|\r|$)/i);
      if (eventMatch) result.eventName = eventMatch[1].trim();

      const sectionMatch = body.match(/Section:\s*(\S+)/i);
      if (sectionMatch) result.section = sectionMatch[1].replace(/,/g, "");

      const priceMatch = body.match(/(?:Sold|Price).*?\$?([\d,.]+)/i);
      if (priceMatch)
        result.salePrice = parseFloat(priceMatch[1].replace(/,/g, ""));

      const qtyMatch = body.match(/Quantity:\s*(\d+)/i);
      if (qtyMatch) result.quantity = parseInt(qtyMatch[1], 10);

      result.confidence =
        result.eventName && result.salePrice ? "high" : "low";

      return result;
    },
  },
};

// ─── Main Parse Function ───────────────────────────────────────────────────

/**
 * Parse an inbound email into a structured sale record.
 * Returns null if the email doesn't match any known sale confirmation pattern.
 */
export function parseEmail(
  from: string,
  subject: string,
  textBody: string,
  htmlBody?: string
): ParsedSale | null {
  // Try both text and HTML versions — some platforms only send HTML
  const strippedHtml = stripHtml(htmlBody ?? "");
  const bodies = [textBody, strippedHtml].filter(Boolean);

  for (const [, parser] of Object.entries(platformParsers)) {
    if (parser.detect(from, subject)) {
      // Try each body version until one yields results
      for (const body of bodies) {
        const result = parser.parse(body, subject);
        if (result && (result.eventName || result.salePrice)) {
          return {
            platform: result.platform ?? "OTHER",
            eventName: result.eventName ?? subject,
            section: result.section ?? null,
            row: result.row ?? null,
            seats: result.seats ?? null,
            quantity: result.quantity ?? 1,
            salePrice: result.salePrice ?? 0,
            buyerOrderId: result.buyerOrderId ?? null,
            confidence: result.confidence ?? "low",
            rawText: body,
          };
        }
      }
    }
  }

  return null;
}

function stripHtml(html: string): string {
  return html
    // Convert table cells and rows to readable text
    .replace(/<\/td>/gi, " ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/th>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    // Strip all remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#?\w+;/g, " ") // Other entities -> space
    // Normalize whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
