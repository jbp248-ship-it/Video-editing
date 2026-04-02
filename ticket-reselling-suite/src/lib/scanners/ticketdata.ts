/**
 * TicketData.com historical price scanner
 * Scrapes historical ticket pricing data including sold prices,
 * price trends, and resale analytics from ticketdata.com.
 */

import type { Page } from "playwright";

export interface HistoricalPricePoint {
  date: string;
  price: number;
  platform: string;
  section: string;
  eventName: string;
}

export interface TicketDataResult {
  eventName: string;
  venue: string;
  historicalPrices: HistoricalPricePoint[];
  averageResalePrice: number | null;
  priceRange: { min: number; max: number } | null;
  totalSalesTracked: number;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

/**
 * Navigate to ticketdata.com, search for an event, and extract
 * historical price data from charts and tables.
 */
export async function scrapeTicketData(
  page: Page,
  searchQuery: string
): Promise<TicketDataResult> {
  // 1. Navigate to ticketdata.com
  await page.goto("https://www.ticketdata.com", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  // 2. Search for the event
  const searchInput = await page.$(
    'input[type="search"], input[name="q"], input[placeholder*="search" i], input[class*="search" i]'
  );
  if (searchInput) {
    await searchInput.fill(searchQuery);
    await searchInput.press("Enter");
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
  }

  // 3. Click the first matching result if on a search results page
  const firstResult = await page.$(
    'a[href*="event"], a[class*="result" i], [class*="search-result" i] a'
  );
  if (firstResult) {
    await firstResult.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
  }

  // 4. Wait for price data to render (tables, charts, or JS-rendered content)
  await page
    .waitForSelector(
      'table, [class*="chart" i], [class*="price" i], [class*="history" i]',
      { timeout: 10_000 }
    )
    .catch(() => {});

  // 5. Extract structured data from the DOM
  return extractTicketDataFromDom(page);
}

/**
 * Extract historical pricing data from the current TicketData page DOM.
 * Looks for price history in tables, chart data in script tags, and
 * structured JSON embedded in the page.
 */
export async function extractTicketDataFromDom(
  page: Page
): Promise<TicketDataResult> {
  return page.evaluate(() => {
    const prices: Array<{
      date: string;
      price: number;
      platform: string;
      section: string;
      eventName: string;
    }> = [];
    let eventName = "";
    let venue = "";

    try {
      eventName = document.querySelector("h1")?.textContent?.trim() ?? "";
      venue =
        document.querySelector('[class*="venue" i]')?.textContent?.trim() ?? "";

      // Look for price history tables/charts
      // TicketData shows historical sold prices in tables
      document
        .querySelectorAll(
          "table tr, [class*='price-row' i], [class*='history' i] tr"
        )
        .forEach((row) => {
          const cells = row.querySelectorAll("td");
          if (cells.length >= 2) {
            const dateText = cells[0]?.textContent?.trim() ?? "";
            const priceText = cells[1]?.textContent?.trim() ?? "";
            const priceMatch = priceText.match(
              /\$?([\d,]+(?:\.\d{2})?)/
            );
            if (priceMatch && dateText) {
              prices.push({
                date: dateText,
                price: parseFloat(priceMatch[1].replace(/,/g, "")),
                platform: cells[2]?.textContent?.trim() ?? "Unknown",
                section: cells[3]?.textContent?.trim() ?? "",
                eventName,
              });
            }
          }
        });

      // Also check for chart data in JavaScript variables
      const scripts = document.querySelectorAll("script");
      scripts.forEach((script) => {
        const text = script.textContent ?? "";
        // Look for chart data arrays (common in charting libraries)
        const chartMatch = text.match(
          /(?:data|prices|history)\s*[=:]\s*(\[[\s\S]*?\])/
        );
        if (chartMatch) {
          try {
            const chartData = JSON.parse(chartMatch[1]);
            if (Array.isArray(chartData)) {
              for (const point of chartData) {
                if (point.price || point.y || point.value) {
                  prices.push({
                    date:
                      point.date ?? point.x ?? point.label ?? "",
                    price:
                      point.price ?? point.y ?? point.value ?? 0,
                    platform: point.platform ?? "TicketData",
                    section: point.section ?? "",
                    eventName,
                  });
                }
              }
            }
          } catch {
            // JSON parse failed — skip this script block
          }
        }
      });

      // Check for __NEXT_DATA__ or similar SSR payloads
      try {
        const nd = document.getElementById("__NEXT_DATA__");
        if (nd?.textContent) {
          const data = JSON.parse(nd.textContent);
          const search = (obj: any, depth: number): void => {
            if (depth > 8 || !obj || typeof obj !== "object") return;
            if (Array.isArray(obj)) {
              obj.forEach((i: any) => search(i, depth + 1));
              return;
            }
            const p = parseFloat(
              String(obj.price ?? obj.soldPrice ?? obj.resalePrice ?? "")
            );
            if (p > 0 && p < 100000 && (obj.date || obj.soldDate)) {
              prices.push({
                date: String(obj.date ?? obj.soldDate ?? ""),
                price: p,
                platform: String(obj.platform ?? obj.source ?? "TicketData"),
                section: String(obj.section ?? obj.sectionName ?? ""),
                eventName,
              });
              return;
            }
            for (const k of Object.keys(obj)) search(obj[k], depth + 1);
          };
          search(data, 0);
        }
      } catch {
        // SSR payload parse failed
      }
    } catch {
      // Top-level extraction failed
    }

    const validPrices = prices.filter((p) => p.price > 0);
    const priceValues = validPrices.map((p) => p.price);

    return {
      eventName,
      venue,
      historicalPrices: validPrices,
      averageResalePrice:
        priceValues.length > 0
          ? priceValues.reduce((a, b) => a + b, 0) / priceValues.length
          : null,
      priceRange:
        priceValues.length > 0
          ? { min: Math.min(...priceValues), max: Math.max(...priceValues) }
          : null,
      totalSalesTracked: validPrices.length,
    };
  });
}
