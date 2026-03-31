/**
 * TicketOps Market Intelligence — Content Script
 *
 * THREE-LAYER SCRAPING STRATEGY (in order of reliability):
 *
 * 1. EMBEDDED DATA (most reliable):
 *    Extract JSON from <script> tags like __NEXT_DATA__, window.__data__,
 *    or other inline data blobs. Sites pre-render ticket data this way.
 *
 * 2. NETWORK INTERCEPTION:
 *    Monkey-patches XHR/fetch to capture API responses the site makes
 *    for pagination, filtering, or lazy-loading listings.
 *
 * 3. DOM WALKING (fallback):
 *    Finds $XX.XX text nodes in the rendered page. Least reliable
 *    but catches anything the other methods miss.
 */

(function () {
  "use strict";

  const DEBOUNCE_MS = 2000;
  const MIN_SCRAPE_INTERVAL_MS = 30000;
  const EMBEDDED_CHECK_DELAY_MS = 3000;
  const FALLBACK_DELAY_MS = 12000;

  let lastScrapeTime = 0;
  let debounceTimer = null;
  let dataCaptured = false;

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

  // ─── Price Parser ────────────────────────────────────────────────────

  function parsePrice(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === "number") return val > 0 && val < 100000 ? val : null;
    const cleaned = String(val).replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) || num <= 0 || num > 100000 ? null : num;
  }

  // ─── LAYER 1: Embedded Data Extraction ───────────────────────────────

  function extractEmbeddedData() {
    const listings = [];

    // Method A: __NEXT_DATA__ (Next.js sites like StubHub)
    try {
      const nextDataEl = document.getElementById("__NEXT_DATA__");
      if (nextDataEl) {
        const nextData = JSON.parse(nextDataEl.textContent);
        const found = findListingsInObject(nextData);
        listings.push(...found);
        if (found.length > 0) {
          console.log(`[TicketOps] Found ${found.length} listings in __NEXT_DATA__`);
        }
      }
    } catch {}

    // Method B: Inline script variables (window.__data__, etc.)
    try {
      const scripts = document.querySelectorAll(
        'script:not([src]):not([type="application/ld+json"])'
      );
      for (const script of scripts) {
        const text = script.textContent ?? "";
        // Look for large JSON objects that might contain listings
        const jsonMatches = text.match(
          /(?:window\.__data__|window\.__INITIAL_STATE__|window\.__PRELOADED_STATE__|self\.__next_f\.push)\s*[=(]\s*(\{[\s\S]{500,}?\});?\s*(?:<\/script>|$)/
        );
        if (jsonMatches) {
          try {
            const data = JSON.parse(jsonMatches[1]);
            const found = findListingsInObject(data);
            listings.push(...found);
          } catch {}
        }

        // Also look for JSON arrays/objects embedded directly
        if (text.includes('"Items"') || text.includes('"listings"') || text.includes('"RawPrice"')) {
          // Try to extract the JSON blob
          const blobMatch = text.match(/(\{[\s\S]*"(?:Items|listings|RawPrice)"[\s\S]*\})/);
          if (blobMatch) {
            try {
              const data = JSON.parse(blobMatch[1]);
              const found = findListingsInObject(data);
              listings.push(...found);
            } catch {}
          }
        }
      }
    } catch {}

    // Method C: JSON-LD structured data
    try {
      const ldScripts = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      for (const script of ldScripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.offers || data["@type"] === "Event") {
            const offers = Array.isArray(data.offers)
              ? data.offers
              : data.offers
                ? [data.offers]
                : [];
            for (const offer of offers) {
              const price = parsePrice(offer.price || offer.lowPrice);
              if (price) listings.push({ price, section: null, row: null });
            }
          }
        } catch {}
      }
    } catch {}

    return listings;
  }

  /**
   * Recursively search an object for arrays that look like ticket listings.
   * StubHub uses: { Items: [{ RawPrice, Section, Row, ... }] }
   * Other sites use: { listings: [{ price, section, ... }] }
   */
  function findListingsInObject(obj, depth = 0) {
    if (depth > 8 || !obj || typeof obj !== "object") return [];

    const results = [];

    // Check if this object IS a listing
    if (isTicketListing(obj)) {
      const price =
        parsePrice(obj.RawPrice) ||
        parsePrice(obj.DisplayPrice) ||
        parsePrice(obj.Price) ||
        parsePrice(obj.PriceWithFees) ||
        parsePrice(obj.price) ||
        parsePrice(obj.currentPrice) ||
        parsePrice(obj.rawPrice) ||
        parsePrice(obj.amount);

      if (price) {
        results.push({
          price,
          section:
            obj.Section || obj.SectionName || obj.section || obj.sectionName || null,
          row: obj.Row || obj.RowName || obj.row || obj.rowName || null,
          quantity:
            obj.MaxQuantity || obj.Quantity || obj.quantity || obj.maxQuantity || null,
        });
        return results;
      }
    }

    // Check if this is an array of listings
    if (Array.isArray(obj)) {
      // Only recurse into arrays that might contain tickets (check first few items)
      const sample = obj.slice(0, 3);
      const hasListings = sample.some(
        (item) => item && typeof item === "object" && isTicketListing(item)
      );
      if (hasListings) {
        for (const item of obj) {
          results.push(...findListingsInObject(item, depth + 1));
        }
        return results;
      }
    }

    // Recurse into known keys that might contain listings
    const keysToCheck = [
      "Items", "items", "listings", "tickets", "offers", "data",
      "results", "sections", "inventory", "ticketListings", "grid",
      "pageProps", "props", "listing", "events", "search",
      "initialData", "content", "body", "payload",
    ];

    for (const key of keysToCheck) {
      if (obj[key] !== undefined) {
        results.push(...findListingsInObject(obj[key], depth + 1));
      }
    }

    return results;
  }

  function isTicketListing(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    // Must have at least a price-like field
    return (
      obj.RawPrice !== undefined ||
      obj.DisplayPrice !== undefined ||
      obj.PriceWithFees !== undefined ||
      obj.Price !== undefined ||
      obj.price !== undefined ||
      obj.currentPrice !== undefined ||
      obj.rawPrice !== undefined ||
      (obj.amount !== undefined && (obj.section !== undefined || obj.Section !== undefined))
    );
  }

  // ─── LAYER 2: Network Interception ───────────────────────────────────

  const networkListings = [];

  function processInterceptedData(data, url) {
    const found = findListingsInObject(data);
    if (found.length > 0) {
      console.log(`[TicketOps] Intercepted ${found.length} listings from: ${url}`);
      networkListings.push(...found);
      dataCaptured = true;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(sendSnapshot, DEBOUNCE_MS);
    }
  }

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

  // Patch XMLHttpRequest
  const OrigXHR = window.XMLHttpRequest;
  const origOpen = OrigXHR.prototype.open;
  const origSend = OrigXHR.prototype.send;

  OrigXHR.prototype.open = function (method, url, ...rest) {
    this._toUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };

  OrigXHR.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (this._toUrl && isTicketApiUrl(this._toUrl) && this.responseText) {
          const data = JSON.parse(this.responseText);
          processInterceptedData(data, this._toUrl);
        }
      } catch {}
    });
    return origSend.call(this, ...args);
  };

  // Patch fetch
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url ?? "";
      if (isTicketApiUrl(url)) {
        const cloned = response.clone();
        cloned.json().then((data) => processInterceptedData(data, url)).catch(() => {});
      }
    } catch {}
    return response;
  };

  // ─── LAYER 3: DOM Fallback ───────────────────────────────────────────

  function domFallbackScrape() {
    const listings = [];
    const seenPrices = new Set();

    const container =
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.querySelector("#content") ||
      document.body;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.textContent?.trim() ?? "";
        if (/^\$\s?[\d,]+(?:\.\d{2})?$/.test(text)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      const price = parsePrice(node.textContent?.trim());
      if (price === null || price < 5) continue;

      const el = node.parentElement;
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const posKey = `${Math.round(rect.x)}-${Math.round(rect.y)}`;
      if (seenPrices.has(posKey)) continue;
      seenPrices.add(posKey);

      if (el.closest("header, footer, nav")) continue;

      // Find section context
      const card =
        el.closest("li, tr, article, [role='listitem']") ??
        el.parentElement?.parentElement?.parentElement;

      let section = null;
      if (card) {
        const text = card.textContent ?? "";
        const m = text.match(/Section\s+(\S+)/i);
        if (m) section = m[1];
      }

      listings.push({ price, section });
    }

    return listings;
  }

  // ─── Event Name ──────────────────────────────────────────────────────

  function getEventName() {
    const el =
      document.querySelector('[data-testid="event-title"]') ??
      document.querySelector("h1");
    if (el) return el.textContent?.trim() ?? cleanTitle(document.title);
    return cleanTitle(document.title);
  }

  function cleanTitle(title) {
    return title
      .replace(/\s*[-|·]\s*(StubHub|Ticketmaster|Vivid Seats|SeatGeek|Etix).*$/i, "")
      .replace(/\s*[-|·]\s*Buy Tickets.*$/i, "")
      .replace(/\s*Tickets\s*$/i, "")
      .trim();
  }

  // ─── Stats & Send ────────────────────────────────────────────────────

  function computeStats(listings) {
    if (listings.length === 0) return null;
    const prices = listings.map((l) => l.price).filter((p) => p > 0).sort((a, b) => a - b);
    if (prices.length === 0) return null;
    const sum = prices.reduce((a, b) => a + b, 0);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
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

    // Try all three sources
    let listings = networkListings.length > 0 ? [...networkListings] : [];
    let source = "network";

    if (listings.length === 0) {
      listings = extractEmbeddedData();
      source = "embedded";
    }

    if (listings.length === 0) {
      listings = domFallbackScrape();
      source = "dom";
    }

    const stats = computeStats(listings);
    if (!stats) {
      console.log("[TicketOps] No listings found via any method.");
      return;
    }

    dataCaptured = true;
    const eventName = getEventName();

    chrome.runtime.sendMessage({
      type: "MARKET_SNAPSHOT",
      data: {
        platform,
        eventName,
        url: window.location.href,
        ...stats,
        capturedAt: new Date().toISOString(),
      },
    });

    console.log(
      `[TicketOps] ✓ Captured ${listings.length} listings via ${source}. ` +
        `Get-in: $${stats.getInPrice} | Median: $${stats.medianPrice} | ` +
        `Event: "${eventName}"`
    );

    showBadge(`✓ ${listings.length} listings | $${stats.getInPrice} get-in`);
    networkListings.length = 0;
  }

  // ─── MutationObserver ────────────────────────────────────────────────

  function setupObserver() {
    const observer = new MutationObserver((mutations) => {
      if (!mutations.some((m) => m.type === "childList" && m.addedNodes.length > 0)) return;
      if (!dataCaptured) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(sendSnapshot, DEBOUNCE_MS);
      }
    });

    const target = document.querySelector("main") || document.body;
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  // ─── On-Page Badge ────────────────────────────────────────────────────

  let badgeEl = null;

  function showBadge(text) {
    if (!badgeEl) {
      badgeEl = document.createElement("div");
      badgeEl.id = "ticketops-badge";
      badgeEl.style.cssText =
        "position:fixed;bottom:16px;right:16px;z-index:999999;" +
        "background:#0ea5e9;color:#fff;font-size:13px;font-weight:600;" +
        "padding:8px 14px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.3);" +
        "font-family:system-ui,sans-serif;cursor:pointer;transition:opacity .3s;";
      badgeEl.onclick = () => { badgeEl.style.opacity = "0"; setTimeout(() => badgeEl?.remove(), 300); badgeEl = null; };
      document.body.appendChild(badgeEl);
    }
    badgeEl.textContent = "TicketOps: " + text;
    badgeEl.style.opacity = "1";
  }

  // ─── Boot ────────────────────────────────────────────────────────────

  const platform = detectPlatform();
  if (platform) {
    console.log(`[TicketOps] Active on ${platform}. Three-layer capture enabled.`);
    showBadge("Scanning...");

    setupObserver();

    // Try embedded data quickly (1.5s)
    setTimeout(() => {
      if (!dataCaptured) {
        console.log("[TicketOps] Layer 1: Checking embedded page data...");
        sendSnapshot();
      }
    }, 1500);

    // Try again after more content may have loaded (4s)
    setTimeout(() => {
      if (!dataCaptured) {
        console.log("[TicketOps] Layer 2: Retrying with network + embedded...");
        sendSnapshot();
      }
    }, 4000);

    // DOM fallback as last resort (8s)
    setTimeout(() => {
      if (!dataCaptured) {
        console.log("[TicketOps] Layer 3: DOM fallback...");
        sendSnapshot();
      }
    }, 8000);

    // Final attempt (15s) — page should be fully loaded by now
    setTimeout(() => {
      if (!dataCaptured) {
        console.log("[TicketOps] Final attempt...");
        sendSnapshot();
        if (!dataCaptured) {
          showBadge("No listings found — try scrolling");
        }
      }
    }, 15000);
  }
})();
