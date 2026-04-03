/**
 * Unified Search — searches StubHub + Ticketmaster simultaneously
 * for a given artist/event name.
 */

import type { Browser } from "playwright";

export interface SearchResult {
  platform: string;
  eventName: string;
  venue: string;
  date: string;
  url: string;
  getInPrice: number | null;
  totalListings: number | null;
  ticketsRemaining: number | null;
}

export interface UnifiedSearchResult {
  query: string;
  results: SearchResult[];
  totalAcrossPlatforms: number;
  cheapestPlatform: string | null;
  cheapestPrice: number | null;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  const { chromium } = await import("playwright");
  browserInstance = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  return browserInstance;
}

async function searchStubHub(query: string): Promise<SearchResult[]> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const results: SearchResult[] = [];

  try {
    await page.goto(`https://www.stubhub.com/find/s/?q=${encodeURIComponent(query)}`, {
      waitUntil: "domcontentloaded", timeout: 20000,
    });
    await page.waitForTimeout(3000);

    const items = await page.evaluate(() => {
      const results: any[] = [];
      // StubHub search results are typically cards/links with event info
      const cards = document.querySelectorAll('a[href*="/event/"], [class*="EventItem"], [class*="event-listing"], [data-testid*="event"]');
      cards.forEach((card) => {
        const text = card.textContent ?? "";
        const href = card.getAttribute("href") ?? "";
        const priceMatch = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null;

        // Try to extract event name, venue, date from card text
        const lines = text.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 2);
        const eventName = lines[0] ?? "";
        const venue = lines.find((l: string) => /arena|center|amphitheater|stadium|theatre|hall|park/i.test(l)) ?? "";
        const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i);
        const date = dateMatch ? dateMatch[0] : "";

        if (eventName && eventName.length > 3) {
          results.push({
            platform: "StubHub",
            eventName: eventName.substring(0, 100),
            venue: venue.substring(0, 100),
            date,
            url: href.startsWith("http") ? href : `https://www.stubhub.com${href}`,
            getInPrice: price,
            totalListings: null,
            ticketsRemaining: null,
          });
        }
      });
      return results.slice(0, 10);
    });
    results.push(...items);
  } catch {}
  await ctx.close();
  return results;
}

async function searchTicketmaster(query: string): Promise<SearchResult[]> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const results: SearchResult[] = [];

  try {
    await page.goto(`https://www.ticketmaster.com/search?q=${encodeURIComponent(query)}`, {
      waitUntil: "domcontentloaded", timeout: 20000,
    });
    await page.waitForTimeout(3000);

    const items = await page.evaluate(() => {
      const results: any[] = [];
      const cards = document.querySelectorAll('a[href*="/event/"], [class*="event"], [data-testid*="result"], li, article');
      cards.forEach((card) => {
        const text = card.textContent ?? "";
        const href = card.querySelector("a")?.getAttribute("href") ?? card.getAttribute("href") ?? "";
        if (!href.includes("/event/") && !href.includes("ticketmaster.com")) return;
        const priceMatch = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null;

        const lines = text.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 3);
        const eventName = lines[0] ?? "";
        const venue = lines.find((l: string) => /arena|center|amphitheater|stadium|theatre|hall|park/i.test(l)) ?? "";
        const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i);
        const date = dateMatch ? dateMatch[0] : "";

        if (eventName && eventName.length > 3 && !results.some((r: any) => r.eventName === eventName)) {
          results.push({
            platform: "Ticketmaster",
            eventName: eventName.substring(0, 100),
            venue: venue.substring(0, 100),
            date,
            url: href.startsWith("http") ? href : `https://www.ticketmaster.com${href}`,
            getInPrice: price,
            totalListings: null,
            ticketsRemaining: null,
          });
        }
      });
      return results.slice(0, 10);
    });
    results.push(...items);
  } catch {}
  await ctx.close();
  return results;
}

export async function unifiedSearch(query: string): Promise<UnifiedSearchResult> {
  // Search both platforms in parallel
  const [stubhubResults, ticketmasterResults] = await Promise.all([
    searchStubHub(query).catch(() => [] as SearchResult[]),
    searchTicketmaster(query).catch(() => [] as SearchResult[]),
  ]);

  const allResults = [...stubhubResults, ...ticketmasterResults];

  // Find cheapest
  const withPrices = allResults.filter((r) => r.getInPrice != null && r.getInPrice > 0);
  const cheapest = withPrices.sort((a, b) => (a.getInPrice ?? 0) - (b.getInPrice ?? 0))[0];

  return {
    query,
    results: allResults,
    totalAcrossPlatforms: allResults.length,
    cheapestPlatform: cheapest?.platform ?? null,
    cheapestPrice: cheapest?.getInPrice ?? null,
  };
}
