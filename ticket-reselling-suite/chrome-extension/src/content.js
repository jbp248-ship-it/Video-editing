/**
 * TicketOps Market Intelligence — Content Script
 *
 * PASSIVE SCRAPING STRATEGY:
 * - We NEVER make fetch/XHR requests to the site's API.
 * - We ONLY read DOM elements already rendered on the user's screen.
 * - We use MutationObserver to detect when ticket listings update.
 * - This is virtually invisible to bot detectors (Akamai, PerimeterX)
 *   because it creates zero additional server traffic.
 *
 * RESILIENT SELECTOR STRATEGY:
 * - Ticket sites use obfuscated/dynamic class names that change frequently.
 * - Instead of targeting specific classes, we use a generic approach:
 *   1. Find the main listing container (right panel, list view)
 *   2. Walk the DOM looking for dollar-amount text nodes
 *   3. Extract section/row context from surrounding text
 */

(function () {
  "use strict";

  // ─── Configuration ───────────────────────────────────────────────────────

  const DEBOUNCE_MS = 2000;
  const MIN_SCRAPE_INTERVAL_MS = 30000;

  let lastScrapeTime = 0;
  let debounceTimer = null;

  // ─── Platform Detection ──────────────────────────────────────────────────

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("stubhub.com")) return "STUBHUB";
    if (host.includes("ticketmaster.com")) return "TICKETMASTER";
    if (host.includes("vividseats.com")) return "VIVID_SEATS";
    if (host.includes("seatgeek.com")) return "SEATGEEK";
    if (host.includes("etix.com")) return "ETIX";
    return null;
  }

  // ─── Generic Price Extraction ──────────────────────────────────────────
  // Works across all platforms by finding dollar amounts in the DOM.

  const PRICE_REGEX = /^\$\s?[\d,]+(?:\.\d{2})?$/;

  /**
   * Parse a price string like "$125.00", "$1,250", "125" into a number.
   */
  function parsePrice(text) {
    if (!text) return null;
    const cleaned = text.replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) || num <= 0 ? null : num;
  }

  /**
   * Find the listing panel — the scrollable area with ticket cards.
   * On most sites this is a right-side panel or main content area.
   */
  function findListingContainer() {
    // Try common patterns for the listing panel
    const candidates = [
      // StubHub: right panel with listing cards
      document.querySelector('[class*="ListingList"], [class*="listing-list"]'),
      document.querySelector('[data-testid*="listing"], [data-testid*="Listing"]'),
      // Generic: scrollable panels, main content
      document.querySelector('[role="list"]'),
      document.querySelector('[class*="search-results"], [class*="SearchResults"]'),
      document.querySelector('[class*="ticket-list"], [class*="TicketList"]'),
      document.querySelector('[class*="event-listings"], [class*="EventListings"]'),
      // Fallback: try the widest scrollable aside/section
      document.querySelector("aside"),
      document.querySelector("main"),
      document.querySelector('[role="main"]'),
    ];

    for (const c of candidates) {
      if (c && c.offsetHeight > 200) return c;
    }

    return document.body;
  }

  /**
   * Generic scraper: walks the listing container and extracts all
   * dollar amounts that look like ticket prices.
   */
  function genericScrape() {
    const container = findListingContainer();
    const listings = [];
    const seenPrices = new Set(); // Dedupe by position

    // Strategy: find all text nodes containing dollar amounts
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.textContent?.trim() ?? "";
          // Match "$56", "$1,250", "$56.00" etc — must start with $
          if (/^\$\s?[\d,]+(?:\.\d{2})?$/.test(text)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        },
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      const priceText = node.textContent?.trim() ?? "";
      const price = parsePrice(priceText);
      if (price === null || price < 1 || price > 100000) continue;

      // Get the parent element for context
      const el = node.parentElement;
      if (!el) continue;

      // Dedupe: skip if we already captured a price at this exact position
      const rect = el.getBoundingClientRect();
      const posKey = `${Math.round(rect.x)}-${Math.round(rect.y)}`;
      if (seenPrices.has(posKey)) continue;
      seenPrices.add(posKey);

      // Skip prices in the header, footer, nav, or map overlay
      if (el.closest("header, footer, nav, [class*='map'], [class*='Map']")) {
        continue;
      }

      // Try to find section/row context by walking up the DOM
      const card =
        el.closest('[class*="listing"], [class*="Listing"], [class*="ticket"], [class*="Ticket"], [class*="card"], [class*="Card"], [class*="offer"], [class*="Offer"], [role="listitem"], li, tr, article') ??
        el.parentElement?.parentElement?.parentElement;

      let section = null;
      if (card) {
        // Look for "Section XXX" text pattern anywhere in the card
        const cardText = card.textContent ?? "";
        const sectionMatch = cardText.match(/Section\s+(\S+)/i);
        if (sectionMatch) section = sectionMatch[1];
      }

      listings.push({ price, section });
    }

    return listings;
  }

  // ─── Platform-Specific Overrides ───────────────────────────────────────
  // These provide better event name extraction per platform.
  // Price extraction uses the generic scraper for all platforms.

  const platformConfig = {
    STUBHUB: {
      getEventName() {
        // StubHub puts the event name in the page title and various h1/h2 elements
        const el =
          document.querySelector('[data-testid="event-title"]') ??
          document.querySelector("h1") ??
          document.querySelector('[class*="event"] h1, [class*="Event"] h1');
        return el?.textContent?.trim() ?? cleanTitle(document.title);
      },
    },

    TICKETMASTER: {
      getEventName() {
        const el =
          document.querySelector("h1.event-header__title") ??
          document.querySelector('[data-testid="event-name"]') ??
          document.querySelector("h1");
        return el?.textContent?.trim() ?? cleanTitle(document.title);
      },
    },

    VIVID_SEATS: {
      getEventName() {
        const el =
          document.querySelector('h1[class*="event-name"]') ??
          document.querySelector('[data-testid="event-title"]') ??
          document.querySelector("h1");
        return el?.textContent?.trim() ?? cleanTitle(document.title);
      },
    },

    SEATGEEK: {
      getEventName() {
        const el =
          document.querySelector('h1[class*="EventTitle"]') ??
          document.querySelector('[data-testid="event-title"]') ??
          document.querySelector("h1");
        return el?.textContent?.trim() ?? cleanTitle(document.title);
      },
    },

    ETIX: {
      getEventName() {
        const el =
          document.querySelector("h1.event-title") ??
          document.querySelector('h1[class*="event"]') ??
          document.querySelector("h1");
        return el?.textContent?.trim() ?? cleanTitle(document.title);
      },
    },
  };

  /**
   * Clean up page title — remove "StubHub", "Ticketmaster", etc.
   */
  function cleanTitle(title) {
    return title
      .replace(/\s*[-|·]\s*(StubHub|Ticketmaster|Vivid Seats|SeatGeek|Etix).*$/i, "")
      .replace(/\s*[-|·]\s*Buy Tickets.*$/i, "")
      .replace(/\s*Tickets\s*$/i, "")
      .trim();
  }

  // ─── Stats Computation ─────────────────────────────────────────────────

  function computeStats(listings) {
    if (listings.length === 0) return null;

    const prices = listings
      .map((l) => l.price)
      .filter((p) => p !== null)
      .sort((a, b) => a - b);

    if (prices.length === 0) return null;

    const sum = prices.reduce((a, b) => a + b, 0);
    const mid = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 === 0
        ? (prices[mid - 1] + prices[mid]) / 2
        : prices[mid];

    return {
      getInPrice: prices[0],
      medianPrice: Math.round(median * 100) / 100,
      averagePrice: Math.round((sum / prices.length) * 100) / 100,
      maxPrice: prices[prices.length - 1],
      totalListings: listings.length,
      totalTickets: listings.length,
    };
  }

  // ─── Main Scrape Logic ─────────────────────────────────────────────────

  function scrapeCurrentPage() {
    const now = Date.now();
    if (now - lastScrapeTime < MIN_SCRAPE_INTERVAL_MS) return;
    lastScrapeTime = now;

    const platform = detectPlatform();
    if (!platform) return;

    // Use generic price extraction for all platforms
    const listings = genericScrape();

    // Use platform-specific event name extraction
    const config = platformConfig[platform] ?? {};
    const eventName = config.getEventName
      ? config.getEventName()
      : cleanTitle(document.title);

    const stats = computeStats(listings);

    if (!stats) {
      console.log("[TicketOps] No listings found on this page.");
      return;
    }

    const snapshot = {
      platform,
      eventName,
      url: window.location.href,
      ...stats,
      capturedAt: new Date().toISOString(),
    };

    chrome.runtime.sendMessage({
      type: "MARKET_SNAPSHOT",
      data: snapshot,
    });

    console.log(
      `[TicketOps] Captured ${listings.length} listings on ${platform}. ` +
        `Get-in: $${stats.getInPrice}, Median: $${stats.medianPrice}, ` +
        `Event: "${eventName}"`
    );
  }

  // ─── MutationObserver Setup ────────────────────────────────────────────

  function setupObserver() {
    const observer = new MutationObserver((mutations) => {
      const isRelevant = mutations.some((m) => {
        if (m.type === "childList" && m.addedNodes.length > 0) return true;
        if (m.type === "characterData") return true;
        return false;
      });

      if (!isRelevant) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scrapeCurrentPage, DEBOUNCE_MS);
    });

    const target =
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.querySelector("#content") ||
      document.body;

    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return observer;
  }

  // ─── Initialize ────────────────────────────────────────────────────────

  const platform = detectPlatform();
  if (platform) {
    console.log(`[TicketOps] Active on ${platform}. Monitoring for listings.`);

    // Initial scrape after page settles
    setTimeout(scrapeCurrentPage, 3000);

    // Start watching for changes
    setupObserver();
  }
})();
