/**
 * TicketOps Market Intelligence — Content Script
 *
 * DUAL SCRAPING STRATEGY:
 *
 * 1. NETWORK INTERCEPTION (primary, most reliable):
 *    Monkey-patches XMLHttpRequest and fetch to intercept the JSON
 *    responses that ticket sites' own frontends make. This gives us
 *    structured data (prices, sections, rows) without parsing HTML.
 *    Creates ZERO extra server traffic — we only read responses the
 *    page already requested.
 *
 * 2. DOM WALKING (fallback):
 *    If network interception finds nothing after 10 seconds, falls
 *    back to walking the DOM for $XX.XX text nodes. Less reliable
 *    but works on sites that pre-render data without XHR.
 */

(function () {
  "use strict";

  const DEBOUNCE_MS = 2000;
  const MIN_SCRAPE_INTERVAL_MS = 30000;
  const FALLBACK_DELAY_MS = 10000;

  let lastScrapeTime = 0;
  let debounceTimer = null;
  let networkDataCaptured = false;

  // ─── Platform Detection ──────────────────────────────────────────────

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("stubhub.com")) return "STUBHUB";
    if (host.includes("ticketmaster.com")) return "TICKETMASTER";
    if (host.includes("vividseats.com")) return "VIVID_SEATS";
    if (host.includes("seatgeek.com")) return "SEATGEEK";
    if (host.includes("etix.com")) return "ETIX";
    return null;
  }

  // ─── Network Interception ────────────────────────────────────────────
  // Intercept XHR and fetch responses to capture structured ticket data
  // from the site's own API calls. This is passive — no extra requests.

  const capturedListings = [];

  /**
   * Try to extract ticket listings from a JSON API response.
   * Each platform returns data in slightly different formats.
   */
  function extractFromApiResponse(data, url) {
    const listings = [];

    try {
      // StubHub API format: { Items: [{ Price, Section, Row, ... }] }
      if (data && data.Items && Array.isArray(data.Items)) {
        for (const item of data.Items) {
          const price =
            parseFloat(item.Price) ||
            parseFloat(item.RawPrice) ||
            parseFloat(item.PriceWithFees) ||
            parseFloat(String(item.DisplayPrice).replace(/[^0-9.]/g, "")) ||
            null;
          if (!price || price <= 0) continue;

          listings.push({
            price,
            section: item.Section || item.SectionName || null,
            row: item.Row || item.RowName || null,
            quantity: item.MaxQuantity || item.Quantity || null,
          });
        }
      }

      // StubHub alternative: { sections: [{ listings: [...] }] }
      if (data && data.sections && Array.isArray(data.sections)) {
        for (const section of data.sections) {
          const sectionName = section.sectionName || section.name || null;
          const sectionListings = section.listings || section.tickets || [];
          for (const item of sectionListings) {
            const price =
              parseFloat(item.price) ||
              parseFloat(item.currentPrice) ||
              parseFloat(item.listingPrice) ||
              null;
            if (!price || price <= 0) continue;
            listings.push({
              price,
              section: sectionName || item.section || null,
              row: item.row || null,
              quantity: item.quantity || null,
            });
          }
        }
      }

      // Generic: array of objects with price-like fields
      if (Array.isArray(data)) {
        for (const item of data) {
          if (!item || typeof item !== "object") continue;
          const price =
            parseFloat(item.price) ||
            parseFloat(item.Price) ||
            parseFloat(item.amount) ||
            parseFloat(item.currentPrice) ||
            parseFloat(item.rawPrice) ||
            null;
          if (!price || price <= 0 || price > 100000) continue;
          listings.push({
            price,
            section:
              item.section || item.Section || item.sectionName || null,
            row: item.row || item.Row || item.rowName || null,
            quantity: item.quantity || item.Quantity || null,
          });
        }
      }

      // Nested: { data: { listings: [...] } } or { results: [...] }
      const nested =
        data?.data?.listings ||
        data?.data?.items ||
        data?.results ||
        data?.listings ||
        data?.tickets ||
        data?.offers ||
        null;
      if (nested && Array.isArray(nested) && listings.length === 0) {
        for (const item of nested) {
          if (!item || typeof item !== "object") continue;
          const price =
            parseFloat(item.price) ||
            parseFloat(item.Price) ||
            parseFloat(item.amount) ||
            parseFloat(item.rawPrice) ||
            parseFloat(item.priceWithFees) ||
            null;
          if (!price || price <= 0 || price > 100000) continue;
          listings.push({
            price,
            section:
              item.section || item.Section || item.sectionName || null,
            row: item.row || item.Row || null,
            quantity: item.quantity || item.Quantity || null,
          });
        }
      }
    } catch (err) {
      // Silently ignore parse errors on non-ticket API responses
    }

    return listings;
  }

  /**
   * Check if a URL looks like a ticket/listing API endpoint.
   */
  function isTicketApiUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes("listing") ||
      lower.includes("ticket") ||
      lower.includes("offer") ||
      lower.includes("inventory") ||
      lower.includes("search") ||
      lower.includes("event") ||
      lower.includes("catalog") ||
      lower.includes("price") ||
      lower.includes("section") ||
      lower.includes("/api/") ||
      lower.includes("graphql")
    );
  }

  function processInterceptedData(data, url) {
    const listings = extractFromApiResponse(data, url);
    if (listings.length > 0) {
      console.log(
        `[TicketOps] Intercepted ${listings.length} listings from: ${url}`
      );
      capturedListings.push(...listings);
      networkDataCaptured = true;

      // Debounce: wait for all API responses to settle, then send snapshot
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(sendSnapshot, DEBOUNCE_MS);
    }
  }

  // ─── Monkey-patch XMLHttpRequest ─────────────────────────────────────

  const OrigXHR = window.XMLHttpRequest;
  const origOpen = OrigXHR.prototype.open;
  const origSend = OrigXHR.prototype.send;

  OrigXHR.prototype.open = function (method, url, ...rest) {
    this._ticketOpsUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };

  OrigXHR.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (
          this._ticketOpsUrl &&
          isTicketApiUrl(this._ticketOpsUrl) &&
          this.responseText
        ) {
          const data = JSON.parse(this.responseText);
          processInterceptedData(data, this._ticketOpsUrl);
        }
      } catch {
        // Not JSON or not relevant — ignore
      }
    });
    return origSend.call(this, ...args);
  };

  // ─── Monkey-patch fetch ──────────────────────────────────────────────

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);

    try {
      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0]?.url ?? "";

      if (isTicketApiUrl(url)) {
        // Clone response so the page can still read it
        const cloned = response.clone();
        cloned.json().then((data) => {
          processInterceptedData(data, url);
        }).catch(() => {});
      }
    } catch {
      // Ignore
    }

    return response;
  };

  // ─── DOM Fallback Scraper ────────────────────────────────────────────

  function parsePrice(text) {
    if (!text) return null;
    const cleaned = text.replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) || num <= 0 ? null : num;
  }

  function domFallbackScrape() {
    const listings = [];
    const seenPrices = new Set();

    const container =
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.querySelector("#content") ||
      document.body;

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.textContent?.trim() ?? "";
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

      const el = node.parentElement;
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      const posKey = `${Math.round(rect.x)}-${Math.round(rect.y)}`;
      if (seenPrices.has(posKey)) continue;
      seenPrices.add(posKey);

      if (
        el.closest("header, footer, nav, [class*='map'], [class*='Map']")
      ) {
        continue;
      }

      const card =
        el.closest(
          '[class*="listing"], [class*="Listing"], [class*="ticket"], ' +
            '[class*="Ticket"], [class*="card"], [class*="Card"], ' +
            '[role="listitem"], li, tr, article'
        ) ?? el.parentElement?.parentElement?.parentElement;

      let section = null;
      if (card) {
        const cardText = card.textContent ?? "";
        const sectionMatch = cardText.match(/Section\s+(\S+)/i);
        if (sectionMatch) section = sectionMatch[1];
      }

      listings.push({ price, section });
    }

    return listings;
  }

  // ─── Event Name Extraction ───────────────────────────────────────────

  function getEventName() {
    const el =
      document.querySelector('[data-testid="event-title"]') ??
      document.querySelector("h1.event-header__title") ??
      document.querySelector("h1");

    if (el) return el.textContent?.trim() ?? cleanTitle(document.title);
    return cleanTitle(document.title);
  }

  function cleanTitle(title) {
    return title
      .replace(
        /\s*[-|·]\s*(StubHub|Ticketmaster|Vivid Seats|SeatGeek|Etix).*$/i,
        ""
      )
      .replace(/\s*[-|·]\s*Buy Tickets.*$/i, "")
      .replace(/\s*Tickets\s*$/i, "")
      .trim();
  }

  // ─── Stats & Snapshot ────────────────────────────────────────────────

  function computeStats(listings) {
    if (listings.length === 0) return null;

    const prices = listings
      .map((l) => l.price)
      .filter((p) => p !== null && p > 0)
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

  function sendSnapshot() {
    const now = Date.now();
    if (now - lastScrapeTime < MIN_SCRAPE_INTERVAL_MS) return;
    lastScrapeTime = now;

    const platform = detectPlatform();
    if (!platform) return;

    // Use network-intercepted data if available, otherwise DOM fallback
    let listings = capturedListings.length > 0 ? [...capturedListings] : [];
    const source = listings.length > 0 ? "network" : "dom";

    if (listings.length === 0) {
      listings = domFallbackScrape();
    }

    const eventName = getEventName();
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
      `[TicketOps] Captured ${listings.length} listings via ${source} on ${platform}. ` +
        `Get-in: $${stats.getInPrice}, Median: $${stats.medianPrice}, ` +
        `Event: "${eventName}"`
    );

    // Clear captured listings for next round
    capturedListings.length = 0;
  }

  // ─── MutationObserver (triggers DOM fallback) ────────────────────────

  function setupObserver() {
    const observer = new MutationObserver((mutations) => {
      const isRelevant = mutations.some((m) => {
        if (m.type === "childList" && m.addedNodes.length > 0) return true;
        if (m.type === "characterData") return true;
        return false;
      });

      if (!isRelevant) return;

      // Only use DOM observer if network interception hasn't captured anything
      if (!networkDataCaptured) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(sendSnapshot, DEBOUNCE_MS);
      }
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

  // ─── Initialize ──────────────────────────────────────────────────────

  const platform = detectPlatform();
  if (platform) {
    console.log(
      `[TicketOps] Active on ${platform}. Intercepting API responses + DOM fallback.`
    );

    // Set up DOM observer as fallback
    setupObserver();

    // Fallback: if network interception hasn't captured anything after 10s,
    // try the DOM scraper
    setTimeout(() => {
      if (!networkDataCaptured) {
        console.log("[TicketOps] No API data intercepted, trying DOM fallback...");
        sendSnapshot();
      }
    }, FALLBACK_DELAY_MS);
  }
})();
