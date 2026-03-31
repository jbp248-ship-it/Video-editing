/**
 * TicketOps Market Intelligence — Content Script
 *
 * PASSIVE SCRAPING STRATEGY:
 * - We NEVER make fetch/XHR requests to the site's API.
 * - We ONLY read DOM elements already rendered on the user's screen.
 * - We use MutationObserver to detect when ticket listings update.
 * - This is virtually invisible to bot detectors (Akamai, PerimeterX)
 *   because it creates zero additional server traffic.
 */

(function () {
  "use strict";

  // ─── Configuration ───────────────────────────────────────────────────────

  const DEBOUNCE_MS = 2000; // Wait 2s after DOM settles before scraping
  const MIN_SCRAPE_INTERVAL_MS = 30000; // Don't scrape more than once per 30s

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

  // ─── DOM Parsing Strategies (per-platform) ───────────────────────────────
  // Each parser reads ONLY from rendered DOM elements.
  // Selectors may need updating as sites change their markup.

  const parsers = {
    STUBHUB: {
      /**
       * StubHub renders ticket listings in a grid/list view.
       * Key elements: price containers, section labels, row info.
       */
      getListings() {
        const listings = [];
        // StubHub uses data attributes and specific class patterns
        const priceElements = document.querySelectorAll(
          '[data-testid="listing-price"], .TicketPrice, [class*="Price"]'
        );

        priceElements.forEach((el) => {
          const priceText = el.textContent?.trim() ?? "";
          const price = parsePrice(priceText);
          if (price === null) return;

          // Walk up DOM to find section/row context
          const listingContainer = el.closest(
            '[data-testid="listing"], [class*="Listing"], [class*="ticket-card"]'
          );
          const section =
            listingContainer?.querySelector(
              '[class*="Section"], [class*="section"]'
            )?.textContent?.trim() ?? null;

          listings.push({ price, section });
        });

        return listings;
      },

      getEventName() {
        return (
          document.querySelector(
            '[data-testid="event-title"], h1[class*="Event"], .event-header h1'
          )?.textContent?.trim() ?? document.title
        );
      },
    },

    TICKETMASTER: {
      getListings() {
        const listings = [];
        const priceElements = document.querySelectorAll(
          '.offer-card__price, [data-testid="offer-price"], [class*="resale-price"]'
        );

        priceElements.forEach((el) => {
          const price = parsePrice(el.textContent?.trim() ?? "");
          if (price === null) return;

          const container = el.closest(
            '.offer-card, [data-testid="offer-card"], [class*="listing-row"]'
          );
          const section =
            container?.querySelector(
              '[class*="section"], [class*="Section"]'
            )?.textContent?.trim() ?? null;

          listings.push({ price, section });
        });

        return listings;
      },

      getEventName() {
        return (
          document.querySelector(
            'h1.event-header__title, [data-testid="event-name"], .event-name'
          )?.textContent?.trim() ?? document.title
        );
      },
    },

    VIVID_SEATS: {
      getListings() {
        const listings = [];
        const priceElements = document.querySelectorAll(
          '[class*="ticket-price"], [data-testid*="price"], .listing-price'
        );

        priceElements.forEach((el) => {
          const price = parsePrice(el.textContent?.trim() ?? "");
          if (price === null) return;

          const container = el.closest(
            '[class*="ticket-listing"], [class*="listing-row"]'
          );
          const section =
            container?.querySelector(
              '[class*="section"]'
            )?.textContent?.trim() ?? null;

          listings.push({ price, section });
        });

        return listings;
      },

      getEventName() {
        return (
          document.querySelector(
            'h1[class*="event-name"], [data-testid="event-title"]'
          )?.textContent?.trim() ?? document.title
        );
      },
    },

    SEATGEEK: {
      getListings() {
        const listings = [];
        const priceElements = document.querySelectorAll(
          '[class*="ListingPrice"], [class*="listing-price"], [data-testid*="price"]'
        );

        priceElements.forEach((el) => {
          const price = parsePrice(el.textContent?.trim() ?? "");
          if (price === null) return;

          const container = el.closest(
            '[class*="Listing"], [class*="listing-row"]'
          );
          const section =
            container?.querySelector(
              '[class*="section"], [class*="Section"]'
            )?.textContent?.trim() ?? null;

          listings.push({ price, section });
        });

        return listings;
      },

      getEventName() {
        return (
          document.querySelector(
            'h1[class*="EventTitle"], [data-testid="event-title"]'
          )?.textContent?.trim() ?? document.title
        );
      },
    },

    ETIX: {
      getListings() {
        const listings = [];

        // Etix uses table rows and various price display patterns
        const priceElements = document.querySelectorAll(
          '[class*="price"], [class*="Price"], .ticket-price, ' +
          '.seat-price, td[class*="price"], .amount, ' +
          '[data-price], .cost, .ticket-cost'
        );

        priceElements.forEach((el) => {
          const price = parsePrice(el.textContent?.trim() ?? "");
          if (price === null) return;

          const container = el.closest(
            'tr, [class*="ticket"], [class*="listing"], ' +
            '[class*="row"], [class*="seat"], .item'
          );
          const section =
            container?.querySelector(
              '[class*="section"], [class*="Section"], ' +
              '[class*="area"], [class*="level"]'
            )?.textContent?.trim() ?? null;

          listings.push({ price, section });
        });

        return listings;
      },

      getEventName() {
        return (
          document.querySelector(
            'h1, .event-title, .event-name, ' +
            '[class*="event-title"], [class*="eventTitle"], ' +
            '.show-title, .performance-title'
          )?.textContent?.trim() ?? document.title
        );
      },
    },
  };

  // ─── Utility Functions ───────────────────────────────────────────────────

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
   * Compute aggregate stats from a list of prices.
   */
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
      totalTickets: listings.length, // Approximate; 1 listing ≈ 1+ tickets
    };
  }

  // ─── Main Scrape Logic ───────────────────────────────────────────────────

  function scrapeCurrentPage() {
    const now = Date.now();
    if (now - lastScrapeTime < MIN_SCRAPE_INTERVAL_MS) return;
    lastScrapeTime = now;

    const platform = detectPlatform();
    if (!platform || !parsers[platform]) return;

    const parser = parsers[platform];
    const listings = parser.getListings();
    const eventName = parser.getEventName();
    const stats = computeStats(listings);

    if (!stats) return;

    const snapshot = {
      platform,
      eventName,
      url: window.location.href,
      ...stats,
      capturedAt: new Date().toISOString(),
    };

    // Send to background script (which forwards to dashboard API)
    chrome.runtime.sendMessage({
      type: "MARKET_SNAPSHOT",
      data: snapshot,
    });

    console.log(
      `[TicketOps] Captured ${listings.length} listings. Get-in: $${stats.getInPrice}`
    );
  }

  // ─── MutationObserver Setup ──────────────────────────────────────────────
  // Watch for DOM changes that indicate ticket listings have been
  // added/updated/removed. This catches:
  // - Initial page load rendering
  // - Infinite scroll loading
  // - Sort/filter changes
  // - Dynamic price updates

  function setupObserver() {
    const observer = new MutationObserver((mutations) => {
      // Check if any mutation is relevant (contains pricing/listing elements)
      const isRelevant = mutations.some((m) => {
        if (m.type === "childList" && m.addedNodes.length > 0) return true;
        if (m.type === "characterData") return true;
        return false;
      });

      if (!isRelevant) return;

      // Debounce: wait for DOM to settle before scraping
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scrapeCurrentPage, DEBOUNCE_MS);
    });

    // Observe the main content area, not the entire document
    // This reduces noise from header/footer/ad mutations
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

  // ─── Initialize ──────────────────────────────────────────────────────────

  const platform = detectPlatform();
  if (platform) {
    console.log(`[TicketOps] Active on ${platform}. Monitoring for listings.`);

    // Initial scrape after page settles
    setTimeout(scrapeCurrentPage, 3000);

    // Start watching for changes
    setupObserver();
  }
})();
