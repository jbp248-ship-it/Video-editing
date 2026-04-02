/**
 * Market Scanner — Playwright-based headless browser scraper
 *
 * Uses a real headless Chromium browser to:
 * 1. Load ticket marketplace pages with full JS rendering
 * 2. Intercept network responses to capture structured API data
 * 3. Fall back to DOM extraction if network interception misses data
 * 4. Extract event name, venue, date, and all listing details
 *
 * This runs server-side in the Next.js API route, NOT in the browser.
 */

import type { Browser, Page } from "playwright";

export interface ScanListing {
  section: string;
  row: string;
  price: number;
  quantity: number;
  priceWithFees: number | null;
  ticketsRemaining: number | null;
}

export interface ScanResult {
  eventName: string;
  venue: string;
  date: string;
  platform: string;
  listings: ScanListing[];
  stats: {
    getInPrice: number;
    medianPrice: number;
    averagePrice: number;
    maxPrice: number;
    totalListings: number;
    totalTicketsRemaining: number | null;
  };
  scannedAt: string;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  const { chromium } = await import("playwright");
  browserInstance = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("stubhub.com")) return "STUBHUB";
  if (lower.includes("ticketmaster.com") || lower.includes("livenation.com")) return "TICKETMASTER";
  if (lower.includes("vividseats.com")) return "VIVID_SEATS";
  if (lower.includes("seatgeek.com")) return "SEATGEEK";
  if (lower.includes("etix.com")) return "ETIX";
  if (lower.includes("axs.com")) return "AXS";
  if (lower.includes("tickpick.com")) return "TICKPICK";
  if (lower.includes("gametime.co")) return "GAMETIME";
  return "OTHER";
}

/**
 * Scan a ticket marketplace URL and extract all listing data.
 */
export async function scanUrl(url: string): Promise<ScanResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });

  const page = await context.newPage();
  const interceptedListings: ScanListing[] = [];

  // Intercept ALL network responses and look for ticket data.
  // Race with a 5s timeout to prevent hangs on huge responses.
  const detectedPlatform = detectPlatform(url);
  page.on("response", async (response) => {
    try {
      const contentType = response.headers()["content-type"] ?? "";
      if (!contentType.includes("json")) return;

      const bodyPromise = response.json();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5000)
      );
      const body = await Promise.race([bodyPromise, timeoutPromise]);

      // Try platform-specific JSON extractor first
      let found: ScanListing[] = [];
      try {
        if (detectedPlatform === "ETIX") {
          const { extractEtixFromJson } = await import("./scanners/etix");
          found = extractEtixFromJson(body);
        } else if (detectedPlatform === "TICKETMASTER") {
          const { extractTicketmasterFromJson } = await import("./scanners/ticketmaster");
          found = extractTicketmasterFromJson(body);
        } else if (detectedPlatform === "VIVID_SEATS") {
          const { extractVividSeatsFromJson } = await import("./scanners/vividseats");
          found = extractVividSeatsFromJson(body);
        } else if (detectedPlatform === "SEATGEEK") {
          const { extractSeatGeekFromJson } = await import("./scanners/seatgeek");
          found = extractSeatGeekFromJson(body);
        } else if (detectedPlatform === "STUBHUB") {
          const { extractStubHubFromJson } = await import("./scanners/stubhub");
          found = extractStubHubFromJson(body);
        } else if (detectedPlatform === "AXS") {
          const { extractAXSFromJson } = await import("./scanners/axs");
          found = extractAXSFromJson(body);
        } else if (detectedPlatform === "TICKPICK") {
          const { extractTickPickFromJson } = await import("./scanners/tickpick");
          found = extractTickPickFromJson(body);
        } else if (detectedPlatform === "GAMETIME") {
          const { extractGametimeFromJson } = await import("./scanners/gametime");
          found = extractGametimeFromJson(body);
        }
      } catch {
        // Platform module not available yet — fall through to generic
      }

      // Fall back to generic extractor
      if (found.length === 0) {
        found = extractListingsFromJson(body);
      }

      if (found.length > 0) {
        interceptedListings.push(...found);
      }
    } catch {
      // Not JSON, too large, or timed out — skip
    }
  });

  try {
    // Navigate and wait for the page to fully render
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Wait extra time for dynamic content to load
    await page.waitForTimeout(3000);

    // Scroll down to trigger lazy-loaded listings
    await autoScroll(page);
    await page.waitForTimeout(2000);

    // Extract event info from the page
    const eventInfo = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const eventName = h1?.textContent?.trim() ?? document.title;

      // Try to find venue and date
      let venue = "";
      let date = "";

      // Common patterns across sites
      const allText = document.body.innerText;

      // Venue: usually near the event title
      const venueEl =
        document.querySelector('[class*="venue" i], [class*="location" i], [data-testid*="venue"]');
      if (venueEl) venue = venueEl.textContent?.trim() ?? "";

      // Date: look for date-like patterns
      const dateEl =
        document.querySelector('[class*="date" i], time, [datetime], [data-testid*="date"]');
      if (dateEl) {
        date = dateEl.getAttribute("datetime") ?? dateEl.textContent?.trim() ?? "";
      }

      return { eventName, venue, date };
    });

    // Platform-specific extraction (higher quality, degrades gracefully)
    let platformListings: ScanListing[] = [];
    let platformResult: { totalTicketsRemaining: number | null } = { totalTicketsRemaining: null };
    const platform = detectPlatform(url);

    try {
      if (platform === "ETIX") {
        const { extractEtixFromDom } = await import("./scanners/etix");
        const domResult = await extractEtixFromDom(page);
        platformListings = domResult.listings;
        platformResult.totalTicketsRemaining = domResult.totalTicketsRemaining;
        if (!eventInfo.eventName && domResult.eventName) eventInfo.eventName = domResult.eventName;
        if (!eventInfo.venue && domResult.venue) eventInfo.venue = domResult.venue;
        if (!eventInfo.date && domResult.date) eventInfo.date = domResult.date;
      } else if (platform === "TICKETMASTER") {
        const { extractTicketmasterFromDom } = await import("./scanners/ticketmaster");
        const domResult = await extractTicketmasterFromDom(page);
        platformListings = domResult.listings;
        platformResult.totalTicketsRemaining = domResult.totalTicketsRemaining;
        if (!eventInfo.eventName && domResult.eventName) eventInfo.eventName = domResult.eventName;
        if (!eventInfo.venue && domResult.venue) eventInfo.venue = domResult.venue;
        if (!eventInfo.date && domResult.date) eventInfo.date = domResult.date;
      } else if (platform === "VIVID_SEATS") {
        const { extractVividSeatsFromDom } = await import("./scanners/vividseats");
        const domResult = await extractVividSeatsFromDom(page);
        platformListings = domResult.listings;
        platformResult.totalTicketsRemaining = domResult.totalTicketsRemaining;
        if (!eventInfo.eventName && domResult.eventName) eventInfo.eventName = domResult.eventName;
        if (!eventInfo.venue && domResult.venue) eventInfo.venue = domResult.venue;
        if (!eventInfo.date && domResult.date) eventInfo.date = domResult.date;
      } else if (platform === "SEATGEEK") {
        const { extractSeatGeekFromDom } = await import("./scanners/seatgeek");
        const domResult = await extractSeatGeekFromDom(page);
        platformListings = domResult.listings;
        platformResult.totalTicketsRemaining = domResult.totalTicketsRemaining;
        if (!eventInfo.eventName && domResult.eventName) eventInfo.eventName = domResult.eventName;
        if (!eventInfo.venue && domResult.venue) eventInfo.venue = domResult.venue;
        if (!eventInfo.date && domResult.date) eventInfo.date = domResult.date;
      } else if (platform === "STUBHUB") {
        const { extractStubHubFromDom } = await import("./scanners/stubhub");
        const domResult = await extractStubHubFromDom(page);
        platformListings = domResult.listings;
        platformResult.totalTicketsRemaining = domResult.totalTicketsRemaining;
        if (!eventInfo.eventName && domResult.eventName) eventInfo.eventName = domResult.eventName;
        if (!eventInfo.venue && domResult.venue) eventInfo.venue = domResult.venue;
        if (!eventInfo.date && domResult.date) eventInfo.date = domResult.date;
      } else if (platform === "AXS") {
        const { extractAXSFromDom } = await import("./scanners/axs");
        const domResult = await extractAXSFromDom(page);
        platformListings = domResult.listings;
        platformResult.totalTicketsRemaining = domResult.totalTicketsRemaining;
        if (!eventInfo.eventName && domResult.eventName) eventInfo.eventName = domResult.eventName;
        if (!eventInfo.venue && domResult.venue) eventInfo.venue = domResult.venue;
        if (!eventInfo.date && domResult.date) eventInfo.date = domResult.date;
      } else if (platform === "TICKPICK") {
        const { extractTickPickFromDom } = await import("./scanners/tickpick");
        const domResult = await extractTickPickFromDom(page);
        platformListings = domResult.listings;
        platformResult.totalTicketsRemaining = domResult.totalTicketsRemaining;
        if (!eventInfo.eventName && domResult.eventName) eventInfo.eventName = domResult.eventName;
        if (!eventInfo.venue && domResult.venue) eventInfo.venue = domResult.venue;
        if (!eventInfo.date && domResult.date) eventInfo.date = domResult.date;
      } else if (platform === "GAMETIME") {
        const { extractGametimeFromDom } = await import("./scanners/gametime");
        const domResult = await extractGametimeFromDom(page);
        platformListings = domResult.listings;
        platformResult.totalTicketsRemaining = domResult.totalTicketsRemaining;
        if (!eventInfo.eventName && domResult.eventName) eventInfo.eventName = domResult.eventName;
        if (!eventInfo.venue && domResult.venue) eventInfo.venue = domResult.venue;
        if (!eventInfo.date && domResult.date) eventInfo.date = domResult.date;
      }
    } catch (err) {
      console.error(`Platform-specific scanner failed for ${platform}:`, err);
      // Falls through to generic extraction below
    }

    // DOM-based price extraction as supplement
    const domListings = await extractFromDom(page);

    // Combine network + DOM results, deduplicate
    // Platform-specific listings first (higher quality)
    const allListings = deduplicateListings([
      ...platformListings,
      ...interceptedListings,
      ...domListings,
    ]);

    if (allListings.length === 0) {
      throw new Error(
        "No listings found. The page may require login, or the event may be sold out."
      );
    }

    const stats = computeStats(allListings);

    // Prefer platform-specific totalTicketsRemaining if available
    if (platformResult.totalTicketsRemaining != null && stats.totalTicketsRemaining == null) {
      stats.totalTicketsRemaining = platformResult.totalTicketsRemaining;
    }

    return {
      eventName: cleanEventName(eventInfo.eventName),
      venue: eventInfo.venue,
      date: eventInfo.date,
      platform,
      listings: allListings.sort((a, b) => a.price - b.price),
      stats,
      scannedAt: new Date().toISOString(),
    };
  } finally {
    await context.close();
  }
}

/**
 * Recursively extract ticket listings from any JSON structure.
 */
function extractListingsFromJson(obj: unknown, depth = 0): ScanListing[] {
  if (depth > 8 || !obj || typeof obj !== "object") return [];

  const results: ScanListing[] = [];

  if (isTicketObject(obj as Record<string, unknown>)) {
    const o = obj as Record<string, unknown>;
    const price =
      toNumber(o.RawPrice) ??
      toNumber(o.rawPrice) ??
      toNumber(o.DisplayPrice) ??
      toNumber(o.displayPrice) ??
      toNumber(o.Price) ??
      toNumber(o.price) ??
      toNumber(o.currentPrice) ??
      toNumber(o.PriceWithFees) ??
      toNumber(o.amount);

    if (price && price > 0 && price < 100000) {
      results.push({
        price,
        section: String(o.Section ?? o.section ?? o.SectionName ?? o.sectionName ?? ""),
        row: String(o.Row ?? o.row ?? o.RowName ?? o.rowName ?? ""),
        quantity: toNumber(o.MaxQuantity ?? o.Quantity ?? o.quantity ?? o.maxQuantity) ?? 1,
        priceWithFees:
          toNumber(o.PriceWithFees) ??
          toNumber(o.priceWithFees) ??
          toNumber(o.allInPrice) ??
          null,
        ticketsRemaining:
          toNumber(o.ticketsRemaining) ??
          toNumber(o.remaining) ??
          toNumber(o.availableCount) ??
          toNumber(o.available) ??
          toNumber(o.quantityRemaining) ??
          null,
      });
      return results;
    }
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      results.push(...extractListingsFromJson(item, depth + 1));
    }
    return results;
  }

  const o = obj as Record<string, unknown>;
  const keysToCheck = [
    "Items", "items", "listings", "tickets", "offers", "data",
    "results", "sections", "inventory", "ticketListings", "grid",
    "pageProps", "props", "listing", "events", "search",
    "initialData", "content", "body", "payload",
  ];

  for (const key of keysToCheck) {
    if (o[key] !== undefined) {
      results.push(...extractListingsFromJson(o[key], depth + 1));
    }
  }

  return results;
}

function isTicketObject(obj: Record<string, unknown>): boolean {
  return (
    obj.RawPrice !== undefined ||
    obj.rawPrice !== undefined ||
    obj.DisplayPrice !== undefined ||
    obj.displayPrice !== undefined ||
    obj.PriceWithFees !== undefined ||
    obj.priceWithFees !== undefined ||
    obj.ticketPrice !== undefined ||
    obj.listPrice !== undefined ||
    obj.buyerPrice !== undefined ||
    obj.faceValue !== undefined ||
    obj.totalPrice !== undefined ||
    (obj.price !== undefined &&
      (obj.section !== undefined || obj.Section !== undefined || obj.row !== undefined)) ||
    (obj.Price !== undefined &&
      (obj.Section !== undefined || obj.Row !== undefined)) ||
    (obj.currentPrice !== undefined &&
      (obj.section !== undefined || obj.Section !== undefined))
  );
}

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Extract prices and section info directly from the rendered DOM.
 */
async function extractFromDom(page: Page): Promise<ScanListing[]> {
  return page.evaluate(() => {
    const listings: Array<{
      price: number;
      section: string;
      row: string;
      quantity: number;
      priceWithFees: number | null;
      ticketsRemaining: number | null;
    }> = [];
    const seen = new Set<string>();

    function parsePrice(text: string): number | null {
      const cleaned = text.replace(/[^0-9.]/g, "");
      const num = parseFloat(cleaned);
      return isNaN(num) || num <= 0 || num > 100000 ? null : num;
    }

    // Strategy 1: Text nodes with $XX patterns
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node: Text) {
          const t = node.textContent?.trim() ?? "";
          return /^\$\s?[\d,]+(?:\.\d{2})?$/.test(t)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      }
    );

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const price = parsePrice(node.textContent?.trim() ?? "");
      if (!price || price < 5) continue;

      const el = node.parentElement;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const key = `${Math.round(rect.x)}-${Math.round(rect.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (el.closest("header, footer, nav")) continue;

      const card =
        el.closest("li, tr, article, [role='listitem'], button") ??
        el.parentElement?.parentElement?.parentElement;
      const cardText = card?.textContent ?? "";
      const secMatch = cardText.match(/Section\s+(\S+)/i);
      const rowMatch = cardText.match(/Row\s+(\S+)/i);

      listings.push({
        price,
        section: secMatch ? secMatch[1] : "",
        row: rowMatch ? rowMatch[1] : "",
        quantity: 1,
        priceWithFees: null,
        ticketsRemaining: null,
      });
    }

    // Strategy 2: aria-labels and data attributes
    const priceEls = document.querySelectorAll(
      "[aria-label*='$'], [data-price], [data-amount], button[aria-label]"
    );
    priceEls.forEach((el) => {
      const text =
        el.getAttribute("aria-label") ??
        el.getAttribute("data-price") ??
        el.getAttribute("data-amount") ??
        "";
      const match = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
      if (!match) return;
      const price = parsePrice(match[1]);
      if (!price || price < 5) return;

      const key = `aria-${text.substring(0, 40)}`;
      if (seen.has(key)) return;
      seen.add(key);

      const secMatch = text.match(/(?:Section|Sec\.?)\s+(\S+)/i);
      const rowMatch = text.match(/Row\s+(\S+)/i);
      listings.push({
        price,
        section: secMatch ? secMatch[1] : "",
        row: rowMatch ? rowMatch[1] : "",
        quantity: 1,
        priceWithFees: null,
        ticketsRemaining: null,
      });
    });

    return listings;
  });
}

function deduplicateListings(listings: ScanListing[]): ScanListing[] {
  const seen = new Set<string>();
  return listings.filter((l) => {
    const key = `${l.price}-${l.section}-${l.row}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    let lastHeight = document.body.scrollHeight;
    let scrolled = 0;
    while (scrolled < 15000) {
      window.scrollBy(0, 500);
      scrolled += 500;
      await new Promise((r) => setTimeout(r, 300));
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) break; // No new content loaded
      lastHeight = newHeight;
    }
    window.scrollTo(0, 0);
  });
  // Wait for lazy-loaded API responses to complete
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    // Timeout is fine — some sites never fully idle
  }
}

function computeStats(listings: ScanListing[]) {
  const prices = listings.map((l) => l.price).sort((a, b) => a - b);
  const sum = prices.reduce((a, b) => a + b, 0);
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];

  const totalTicketsRemaining = listings.reduce((acc, l) => {
    if (l.ticketsRemaining != null) return acc + l.ticketsRemaining;
    return acc;
  }, 0);

  return {
    getInPrice: prices[0],
    medianPrice: Math.round(median * 100) / 100,
    averagePrice: Math.round((sum / prices.length) * 100) / 100,
    maxPrice: prices[prices.length - 1],
    totalListings: listings.length,
    totalTicketsRemaining: totalTicketsRemaining > 0 ? totalTicketsRemaining : null,
  };
}

function cleanEventName(name: string): string {
  return name
    .replace(
      /\s*[-|·]\s*(StubHub|Ticketmaster|Vivid Seats|SeatGeek|Etix|AXS|TickPick|Gametime|Live Nation).*$/i,
      ""
    )
    .replace(/\s*[-|·]\s*Buy Tickets.*$/i, "")
    .replace(/\s*Tickets?\s*$/i, "")
    .trim();
}
