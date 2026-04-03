const { app, BrowserWindow, BrowserView, ipcMain, shell, globalShortcut, dialog } = require("electron");
const { spawn, execSync } = require("child_process");
const path = require("path");
const http = require("http");
const net = require("net");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const PORT = 3099;
const isDev = !app.isPackaged;
let mainWindow = null;
let nextProcess = null;
let ticketBrowserView = null;
let sidebarWidth = 224; // Synced from renderer
let splashTimeout = null;

function killProcessTree(proc) {
  if (!proc || proc.killed) return;
  if (process.platform === "win32") {
    try { execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: "pipe" }); } catch {}
  } else {
    proc.kill();
  }
}

function cleanupAndQuit(reason) {
  console.error("Fatal cleanup:", reason);
  killProcessTree(nextProcess);
  nextProcess = null;
  if (splashTimeout) { clearTimeout(splashTimeout); splashTimeout = null; }
  app.quit();
}

// ─── Crash guards: kill zombie Next.js on unhandled errors ────────────
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  dialog.showErrorBox("TicketReselling — Unexpected Error", `An unexpected error occurred:\n\n${err.message}`);
  cleanupAndQuit("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  dialog.showErrorBox("TicketReselling — Unexpected Error", `An unhandled promise rejection occurred:\n\n${String(reason)}`);
  cleanupAndQuit("unhandledRejection");
});

function getProjectRoot() {
  return isDev ? path.join(__dirname, "..") : path.join(process.resourcesPath, "app");
}

function getDatabasePath() {
  return `file:${path.join(app.getPath("userData"), "ticketops.db")}`;
}

function getEnv() {
  return {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: getDatabasePath(),
    NODE_ENV: isDev ? "development" : "production",
  };
}

async function initDatabase() {
  try {
    // Generate Prisma client first (needed for Next.js to work)
    console.log("Generating Prisma client...");
    await new Promise((resolve, reject) => {
      const proc = spawn("npx", ["prisma", "generate"], {
        cwd: getProjectRoot(), env: getEnv(), shell: true, stdio: "pipe", timeout: 30000,
      });
      proc.on("close", (code) => code === 0 ? resolve(undefined) : resolve(undefined)); // Don't fail on error
      proc.on("error", () => resolve(undefined));
    });

    // Push DB schema
    console.log("Pushing database schema...");
    await new Promise((resolve, reject) => {
      const proc = spawn("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
        cwd: getProjectRoot(), env: getEnv(), shell: true, stdio: "pipe", timeout: 30000,
      });
      let stderr = "";
      proc.stderr.on("data", (d) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve(undefined);
        else reject(new Error(stderr || `prisma db push exited with code ${code}`));
      });
      proc.on("error", (err) => reject(err));
    });
    console.log("Database initialized at:", getDatabasePath());
  } catch (err) {
    console.error("Database init failed:", err.message);
    // Don't show error dialog — app can still work if DB was previously set up
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => { server.close(); resolve(true); });
    server.listen(port, "127.0.0.1");
  });
}

function killProcessOnPort(port) {
  if (process.platform === "win32") {
    try {
      const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { shell: true, stdio: "pipe" }).toString();
      const lines = output.trim().split("\n");
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0" && pid !== String(process.pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try { execSync(`taskkill /F /PID ${pid}`, { shell: true, stdio: "pipe" }); } catch {}
      }
      if (pids.size > 0) {
        console.log(`Killed ${pids.size} stale process(es) on port ${port}`);
        // Wait a moment for the port to be released
        const start = Date.now();
        while (Date.now() - start < 2000) { /* busy wait */ }
      }
    } catch {
      // netstat found nothing — port is free
    }
  } else {
    try { execSync(`lsof -ti :${port} | xargs kill -9`, { shell: true, stdio: "pipe" }); } catch {}
  }
}

function startNextServer() {
  // Auto-kill any stale process on the port before starting
  killProcessOnPort(PORT);

  const cmd = isDev ? "dev" : "start";
  let stderrOutput = "";

  nextProcess = spawn("npx", ["next", cmd, "-p", String(PORT)], {
    cwd: getProjectRoot(), env: getEnv(), shell: true, stdio: "pipe",
  });
  nextProcess.stdout.on("data", (d) => console.log(`[next] ${d.toString().trim()}`));
  nextProcess.stderr.on("data", (d) => {
    const text = d.toString().trim();
    stderrOutput += text + "\n";
    console.error(`[next] ${text}`);
  });
  nextProcess.on("close", (code) => {
    console.log(`Next.js exited with code ${code}`);
    if (code !== 0 && !nextProcess._retried) {
      console.log("Retrying Next.js startup...");
      nextProcess._retried = true;
      killProcessOnPort(PORT);
      setTimeout(() => startNextServer(), 2000);
      return;
    }
    if (code !== 0) {
      dialog.showErrorBox(
        "TicketReselling — Next.js Failed",
        `Next.js dev server crashed:\n\n${(stderrOutput || "").slice(0, 1000)}`
      );
      app.quit();
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) app.quit();
  });
  nextProcess.on("error", (err) => {
    dialog.showErrorBox(
      "TicketReselling — Failed to Start",
      `Could not start Next.js:\n\n${err.message}`
    );
  });
}

function waitForServer(retries = 240) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      if (attempts % 10 === 0) console.log(`Waiting for Next.js... (${attempts}/${retries})`);
      const req = http.get(`http://localhost:${PORT}`, { timeout: 2000 }, (res) => {
        res.resume();
        req.destroy();
        if (res.statusCode < 400) resolve();
        else if (attempts >= retries) reject(new Error(`Server returned ${res.statusCode}`));
        else setTimeout(check, 500);
      });
      req.on("error", () => {
        req.destroy();
        if (attempts >= retries) reject(new Error("Server did not start in time"));
        else setTimeout(check, 500);
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    title: "TicketReselling", backgroundColor: "#FAF9F6",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: true, // Show immediately with splash screen
  });

  // Load splash instantly — no waiting for Next.js
  mainWindow.loadFile(path.join(__dirname, "loading.html"));

  // Keep links within the app — don't open external browser
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.on("resize", () => resizeBrowserView());
  mainWindow.on("maximize", () => resizeBrowserView());
  mainWindow.on("unmaximize", () => resizeBrowserView());
  mainWindow.on("move", () => resizeBrowserView());
}

function navigateToApp() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(`http://localhost:${PORT}`);
}

// ─── Embedded Browser (BrowserView) ────────────────────────────────────

let dataPanelWidth = 380;
let browserTopOffset = 120;

function resizeBrowserView() {
  if (!ticketBrowserView || !mainWindow) return;
  const bounds = mainWindow.getContentBounds();
  ticketBrowserView.setBounds({
    x: Math.max(0, sidebarWidth),
    y: Math.max(0, browserTopOffset),
    width: Math.max(0, bounds.width - sidebarWidth - dataPanelWidth),
    height: Math.max(0, bounds.height - browserTopOffset),
  });
}

function createBrowserView(url) {
  if (ticketBrowserView) {
    mainWindow.removeBrowserView(ticketBrowserView);
    ticketBrowserView.webContents.destroy();
    ticketBrowserView = null;
  }

  ticketBrowserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.addBrowserView(ticketBrowserView);
  resizeBrowserView();

  const wc = ticketBrowserView.webContents;

  wc.on("did-finish-load", () => injectCaptureScript(wc));
  wc.on("did-navigate-in-page", () => setTimeout(() => injectCaptureScript(wc), 2000));

  wc.on("did-navigate", (_, navUrl) => {
    mainWindow?.webContents.send("browser-url-changed", navUrl);
  });
  wc.on("did-navigate-in-page", (_, navUrl) => {
    mainWindow?.webContents.send("browser-url-changed", navUrl);
  });
  wc.on("did-start-loading", () => mainWindow?.webContents.send("browser-loading", true));
  wc.on("did-stop-loading", () => mainWindow?.webContents.send("browser-loading", false));

  // Keep ALL navigation inside the BrowserView — never open external browsers
  wc.setWindowOpenHandler(({ url: newUrl }) => {
    // Navigate the BrowserView itself instead of opening a new window
    wc.loadURL(newUrl);
    return { action: "deny" };
  });

  // Also intercept window.open / target="_blank" via will-navigate
  wc.on("will-navigate", (event, navUrl) => {
    // Allow navigation within the BrowserView — do nothing to block it
  });

  wc.loadURL(url);
}

/**
 * Inject capture script. Uses window.__ticketOpsData (NOT document.title)
 * to avoid data leakage via referrer headers and browser history.
 */
function injectCaptureScript(wc) {
  wc.executeJavaScript(`
    (function() {
      if (window.__ticketOpsInjected) return;
      window.__ticketOpsInjected = true;
      window.__ticketOpsData = null;

      var captured = { listings: [], eventName: '', platform: '' };

      function detectPlatform() {
        var h = location.hostname;
        if (h.includes('stubhub.com')) return 'STUBHUB';
        if (h.includes('ticketmaster.com') || h.includes('livenation.com')) return 'TICKETMASTER';
        if (h.includes('vividseats.com')) return 'VIVID_SEATS';
        if (h.includes('seatgeek.com')) return 'SEATGEEK';
        if (h.includes('etix.com')) return 'ETIX';
        if (h.includes('axs.com')) return 'AXS';
        if (h.includes('tickpick.com')) return 'TICKPICK';
        if (h.includes('gametime.co')) return 'GAMETIME';
        return 'OTHER';
      }

      function toNum(v) {
        if (v == null) return null;
        if (typeof v === 'number') return v;
        var n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
        return isNaN(n) ? null : n;
      }

      function isTicket(o) {
        return o && typeof o === 'object' && !Array.isArray(o) && (
          o.RawPrice !== undefined || o.rawPrice !== undefined ||
          o.DisplayPrice !== undefined || o.displayPrice !== undefined ||
          o.PriceWithFees !== undefined || o.priceWithFees !== undefined ||
          o.ticketPrice !== undefined || o.listPrice !== undefined ||
          o.currentPrice !== undefined || o.buyerPrice !== undefined ||
          o.faceValue !== undefined || o.totalPrice !== undefined ||
          (o.price !== undefined && (o.section !== undefined || o.Section !== undefined)) ||
          (o.Price !== undefined && (o.Section !== undefined || o.Row !== undefined))
        );
      }

      function extract(obj, depth) {
        if (depth > 8 || !obj || typeof obj !== 'object') return [];
        var results = [];
        if (isTicket(obj)) {
          var p = toNum(obj.RawPrice) || toNum(obj.rawPrice) || toNum(obj.DisplayPrice) ||
                  toNum(obj.displayPrice) || toNum(obj.Price) || toNum(obj.price) ||
                  toNum(obj.currentPrice) || toNum(obj.PriceWithFees) || toNum(obj.amount);
          if (p && p > 0 && p < 100000) {
            results.push({
              price: p,
              section: String(obj.Section || obj.section || obj.SectionName || obj.sectionName || ''),
              row: String(obj.Row || obj.row || obj.RowName || obj.rowName || ''),
              quantity: toNum(obj.MaxQuantity || obj.Quantity || obj.quantity) || 1,
              priceWithFees: toNum(obj.PriceWithFees || obj.priceWithFees || obj.allInPrice) || null,
              ticketsRemaining: toNum(obj.ticketsRemaining) || toNum(obj.remaining) || toNum(obj.availableCount) || toNum(obj.available) || toNum(obj.quantityRemaining) || null
            });
            return results;
          }
        }
        if (Array.isArray(obj)) {
          for (var i = 0; i < obj.length; i++) results.push.apply(results, extract(obj[i], depth+1));
          return results;
        }
        var keys = ['Items','items','listings','tickets','offers','data','results','sections',
                     'inventory','ticketListings','pageProps','props','listing','search',
                     'initialData','content','body','payload'];
        for (var k = 0; k < keys.length; k++) {
          if (obj[keys[k]] !== undefined) results.push.apply(results, extract(obj[keys[k]], depth+1));
        }
        return results;
      }

      // Intercept XHR
      var origOpen = XMLHttpRequest.prototype.open;
      var origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(m, u) {
        this.__toUrl = u;
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
          try {
            if (this.responseText && this.responseText.length > 50 && this.responseText.length < 5000000) {
              var data = JSON.parse(this.responseText);
              var found = extract(data, 0);
              if (found.length > 0) {
                captured.listings.push.apply(captured.listings, found);
                sendUpdate();
              }
            }
          } catch(e) {}
        });
        return origSend.apply(this, arguments);
      };

      // Intercept fetch
      var origFetch = window.fetch;
      window.fetch = function() {
        return origFetch.apply(this, arguments).then(function(resp) {
          var cloned = resp.clone();
          cloned.text().then(function(text) {
            try {
              if (text.length > 50 && text.length < 5000000) {
                var data = JSON.parse(text);
                var found = extract(data, 0);
                if (found.length > 0) {
                  captured.listings.push.apply(captured.listings, found);
                  sendUpdate();
                }
              }
            } catch(e) {}
          }).catch(function(){});
          return resp;
        });
      };

      // Check __NEXT_DATA__ + DOM fallback
      setTimeout(function() {
        try {
          var nd = document.getElementById('__NEXT_DATA__');
          if (nd) {
            var found = extract(JSON.parse(nd.textContent), 0);
            if (found.length > 0) {
              captured.listings.push.apply(captured.listings, found);
              sendUpdate();
            }
          }
        } catch(e) {}

        // ── ETIX-SPECIFIC EXTRACTION ──
        // Etix shows price TIERS not individual listings.
        // Each tier can have hundreds of tickets. We need to:
        // 1. Find all price tiers from the page
        // 2. Check quantity selectors for max available per tier
        // 3. Look for availability text ("X remaining", "Limited", etc.)
        if (captured.platform === 'ETIX') {
          try {
            var etixListings = [];

            // Strategy 1: Find Etix ticket type/tier blocks
            // Etix shows sections as clickable areas with prices
            var priceBlocks = document.querySelectorAll(
              '[class*="price" i], [class*="tier" i], [class*="ticket-type" i], ' +
              '[class*="level" i], [class*="section" i], [class*="category" i], ' +
              '.ticket-selection, .price-level, .seat-section, ' +
              'table tr, li, [role="option"], [role="listitem"]'
            );

            priceBlocks.forEach(function(block) {
              var text = block.textContent || '';
              var priceMatch = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
              if (!priceMatch) return;
              var price = parseFloat(priceMatch[1].replace(/,/g, ''));
              if (!price || price < 3 || price > 100000) return;

              // Find section/tier name
              var sectionName = '';
              var nameEl = block.querySelector('[class*="name" i], [class*="title" i], [class*="label" i], [class*="tier" i], th, strong, b');
              if (nameEl) sectionName = nameEl.textContent.trim();
              if (!sectionName) {
                // Try to get from parent or preceding sibling
                var prev = block.previousElementSibling;
                if (prev && !prev.textContent.match(/\$/)) sectionName = prev.textContent.trim();
              }

              // Find quantity available
              var qtyAvailable = null;

              // Check for quantity dropdown (select element) - max option = max available
              var select = block.querySelector('select, [class*="qty" i], [class*="quantity" i]');
              if (select && select.tagName === 'SELECT') {
                var options = select.querySelectorAll('option');
                var maxQty = 0;
                options.forEach(function(opt) {
                  var v = parseInt(opt.value || opt.textContent, 10);
                  if (v > maxQty) maxQty = v;
                });
                if (maxQty > 0) qtyAvailable = maxQty;
              }

              // Check for "X remaining/available/left" text
              var remMatch = text.match(/(\d+)\s*(?:tickets?|seats?)?\s*(?:remaining|available|left)/i);
              if (remMatch) qtyAvailable = parseInt(remMatch[1], 10);

              // Check for "Limited" or "Few Left" (estimate low availability)
              if (!qtyAvailable && /limited|few left|almost gone|selling fast/i.test(text)) {
                qtyAvailable = 10; // Conservative estimate
              }

              // Check for "Sold Out" - skip this tier
              if (/sold\s*out|unavailable|not available/i.test(text)) {
                return; // Don't add sold out tiers
              }

              // Check for input[type=number] with max attribute
              var numInput = block.querySelector('input[type="number"]');
              if (numInput) {
                var max = parseInt(numInput.getAttribute('max') || '0', 10);
                if (max > 0) qtyAvailable = max;
              }

              etixListings.push({
                price: price,
                section: sectionName.replace(/\$[\d,.]+/g, '').trim().substring(0, 50) || 'General',
                row: '',
                quantity: qtyAvailable || 1,
                priceWithFees: price, // Etix uses all-in pricing
                ticketsRemaining: qtyAvailable
              });
            });

            // Strategy 2: Check for Etix's JavaScript variables
            // Etix sometimes stores availability in window-level objects
            try {
              var scripts = document.querySelectorAll('script:not([src])');
              scripts.forEach(function(script) {
                var code = script.textContent || '';
                // Look for availability/capacity data in script tags
                var capMatch = code.match(/(?:capacity|totalSeats|maxTickets|availableTickets|ticketsAvailable)\s*[=:]\s*(\d+)/i);
                if (capMatch) {
                  var capacity = parseInt(capMatch[1], 10);
                  if (capacity > 0 && capacity < 200000) {
                    // Store as metadata on captured data
                    captured.etixCapacity = capacity;
                  }
                }
                // Look for inventory/availability arrays
                var invMatch = code.match(/(?:inventory|availability|priceLevels|tiers)\s*[=:]\s*(\[[\s\S]*?\])/);
                if (invMatch) {
                  try {
                    var invData = JSON.parse(invMatch[1]);
                    if (Array.isArray(invData)) {
                      invData.forEach(function(item) {
                        if (item && (item.price || item.amount || item.cost)) {
                          var p = toNum(item.price || item.amount || item.cost);
                          if (p && p > 0) {
                            etixListings.push({
                              price: p,
                              section: String(item.name || item.section || item.tier || item.label || 'General'),
                              row: '',
                              quantity: toNum(item.available || item.remaining || item.qty || item.quantity) || 1,
                              priceWithFees: p,
                              ticketsRemaining: toNum(item.available || item.remaining || item.qty || item.quantity) || null
                            });
                          }
                        }
                      });
                    }
                  } catch(e2) {}
                }
              });
            } catch(e3) {}

            // Strategy 3: Look at the "Pricing from $X to $Y" text to identify it's a tier listing
            var pricingText = document.body.innerText;
            var pricingRange = pricingText.match(/Pricing from \$([\d,.]+) to \$([\d,.]+)/i);
            if (pricingRange && etixListings.length === 0) {
              // We know prices but no listings found - create tier placeholders
              // and mark that availability is unknown (needs section click)
              captured.etixNote = 'Click a section on the map to see available tickets per tier';
            }

            // Replace generic DOM listings with Etix-specific ones if we found any
            if (etixListings.length > 0) {
              captured.listings = etixListings;
              sendUpdate();
            }
          } catch(etixErr) {}
        }

        // DOM fallback (non-Etix or if Etix extraction found nothing)
        try {
          var domListings = [];
          var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: function(n) {
              return /^\\$\\s?[\\d,]+(\\.\\d{2})?$/.test(n.textContent.trim())
                ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
            }
          });
          var node;
          while (node = walker.nextNode()) {
            var t = node.textContent.trim();
            var p = parseFloat(t.replace(/[^0-9.]/g, ''));
            if (p > 4 && p < 100000) {
              var el = node.parentElement;
              if (el && !el.closest('header,footer,nav')) {
                var card = el.closest('li,tr,article,[role=listitem]') || el.parentElement;
                var ct = card ? card.textContent : '';
                var sm = ct.match(/Section\\s+(\\S+)/i);
                var rm = ct.match(/Row\\s+(\\S+)/i);
                var remainMatch = ct.match(/(?:remaining|left|available)[:\\s]*(\\d+)/i);
                var ticketsRem = remainMatch ? parseInt(remainMatch[1], 10) : null;
                domListings.push({ price: p, section: sm?sm[1]:'', row: rm?rm[1]:'', quantity: 1, priceWithFees: null, ticketsRemaining: ticketsRem });
              }
            }
          }

          // aria-label fallback
          document.querySelectorAll('[aria-label*="$"], button[aria-label]').forEach(function(el) {
            var label = el.getAttribute('aria-label') || '';
            var m = label.match(/\\$\\s?([\\d,]+(?:\\.\\d{2})?)/);
            if (m) {
              var p = parseFloat(m[1].replace(/,/g,''));
              if (p > 4 && p < 100000) {
                var sm = label.match(/(?:Section|Sec)\\.?\\s+(\\S+)/i);
                var rm = label.match(/Row\\s+(\\S+)/i);
                var remMatch = label.match(/(?:remaining|left|available)[:\\s]*(\\d+)/i);
                var ticketsRem = remMatch ? parseInt(remMatch[1], 10) : null;
                domListings.push({ price: p, section: sm?sm[1]:'', row: rm?rm[1]:'', quantity: 1, priceWithFees: null, ticketsRemaining: ticketsRem });
              }
            }
          });

          if (domListings.length > 0 && captured.listings.length === 0) {
            captured.listings.push.apply(captured.listings, domListings);
            sendUpdate();
          }
        } catch(e) {}
      }, 3000);

      captured.platform = detectPlatform();
      captured.eventName = (document.querySelector('h1') || {}).textContent || document.title;

      // Re-scan on DOM changes (e.g., user clicks a section on Etix, new data loads)
      if (captured.platform === 'ETIX') {
        var observer = new MutationObserver(function() {
          // Debounced re-extraction when Etix page changes (section selected, modal opened)
          clearTimeout(captured._rescanTimer);
          captured._rescanTimer = setTimeout(function() {
            // Look for newly visible quantity selectors or availability text
            var selects = document.querySelectorAll('select');
            selects.forEach(function(sel) {
              var options = sel.querySelectorAll('option');
              var maxQty = 0;
              options.forEach(function(opt) {
                var v = parseInt(opt.value || opt.textContent, 10);
                if (v > maxQty) maxQty = v;
              });
              if (maxQty > 1) {
                // Found a quantity selector with real data
                var parent = sel.closest('[class*="ticket" i], [class*="section" i], tr, li, div') || sel.parentElement;
                var priceText = parent ? parent.textContent : '';
                var pm = priceText.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
                if (pm) {
                  var price = parseFloat(pm[1].replace(/,/g, ''));
                  if (price > 3) {
                    // Update existing listing or add new one
                    var found = false;
                    for (var i = 0; i < captured.listings.length; i++) {
                      if (Math.abs(captured.listings[i].price - price) < 0.01) {
                        captured.listings[i].ticketsRemaining = maxQty;
                        captured.listings[i].quantity = maxQty;
                        found = true;
                        break;
                      }
                    }
                    if (!found) {
                      captured.listings.push({
                        price: price,
                        section: 'Selected Section',
                        row: '',
                        quantity: maxQty,
                        priceWithFees: price,
                        ticketsRemaining: maxQty
                      });
                    }
                    captured.etixNote = null; // Clear the "click to see" note
                    sendUpdate();
                  }
                }
              }
            });
          }, 1500);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }

      var debounce = null;
      function sendUpdate() {
        clearTimeout(debounce);
        debounce = setTimeout(function() {
          var seen = {};
          var unique = captured.listings.filter(function(l) {
            var k = JSON.stringify([l.price, l.section || null, l.row || null]);
            if (seen[k]) return false;
            seen[k] = true;
            return true;
          });
          captured.listings = unique;

          // Compute totalTicketsRemaining from captured listings
          var totalRemaining = 0;
          var hasRemaining = false;
          for (var r = 0; r < unique.length; r++) {
            if (unique[r].ticketsRemaining != null) {
              totalRemaining += unique[r].ticketsRemaining;
              hasRemaining = true;
            }
          }

          // Store in window variable — safe, no referrer/history leakage
          window.__ticketOpsData = {
            platform: captured.platform,
            eventName: captured.eventName.replace(/(\\s*[-|]\\s*(StubHub|Ticketmaster|Vivid|SeatGeek|Etix|AXS|TickPick|Gametime|Live Nation).*$)/i, '').trim(),
            url: location.href,
            listings: unique.slice(0, 500),
            count: unique.length,
            totalTicketsRemaining: hasRemaining ? totalRemaining : null,
            estimatedCapacity: captured.etixCapacity || null,
            note: captured.etixNote || null
          };
        }, 1000);
      }
    })();
  `).catch(() => {});
}

// ─── IPC Handlers ──────────────────────────────────────────────────────

ipcMain.handle("browser-navigate", (_, url) => {
  if (!url.startsWith("http")) url = "https://" + url;
  createBrowserView(url);
  return true;
});

ipcMain.handle("browser-back", () => {
  if (ticketBrowserView?.webContents.canGoBack()) ticketBrowserView.webContents.goBack();
});

ipcMain.handle("browser-forward", () => {
  if (ticketBrowserView?.webContents.canGoForward()) ticketBrowserView.webContents.goForward();
});

ipcMain.handle("browser-refresh", () => {
  ticketBrowserView?.webContents.reload();
});

function closeBrowserView() {
  if (ticketBrowserView && mainWindow) {
    mainWindow.removeBrowserView(ticketBrowserView);
    ticketBrowserView.webContents.destroy();
    ticketBrowserView = null;
    // Notify renderer that browser was closed
    mainWindow.webContents.send("browser-closed");
  }
}

ipcMain.handle("browser-close", () => closeBrowserView());

// Read captured data from window.__ticketOpsData (not document.title)
ipcMain.handle("browser-get-data", async () => {
  if (!ticketBrowserView) return null;
  try {
    const data = await ticketBrowserView.webContents.executeJavaScript(
      "window.__ticketOpsData"
    );
    return data || null;
  } catch {}
  return null;
});

// Sync sidebar collapse state from renderer
ipcMain.handle("browser-set-sidebar-width", (_, width) => {
  sidebarWidth = width;
  resizeBrowserView();
});

// Sync data panel width from renderer (resizable panel)
ipcMain.handle("browser-set-data-panel-width", (_, width) => {
  dataPanelWidth = Math.max(200, Math.min(600, width));
  resizeBrowserView();
});

// Sync top offset from renderer (exact toolbar height)
ipcMain.handle("browser-set-top-offset", (_, offset) => {
  browserTopOffset = Math.max(0, offset);
  resizeBrowserView();
});

// ─── Auto-Update via git pull ─────────────────────────────────────────
ipcMain.handle("app-check-update", async () => {
  try {
    const cwd = getProjectRoot();
    // Fetch latest from remote
    execSync("git fetch origin", { cwd, shell: true, stdio: "pipe", timeout: 15000 });
    // Check if we're behind
    const status = execSync("git status -uno", { cwd, shell: true, stdio: "pipe", timeout: 5000 }).toString();
    const behind = status.includes("behind");
    return { available: behind, current: app.getVersion() };
  } catch (err) {
    return { available: false, error: err.message };
  }
});

ipcMain.handle("app-install-update", async () => {
  try {
    const cwd = getProjectRoot();
    // Pull latest code
    execSync("git pull origin", { cwd, shell: true, stdio: "pipe", timeout: 30000 });
    // Regenerate Prisma client in case schema changed
    execSync("npx prisma generate", { cwd, shell: true, stdio: "pipe", timeout: 30000 });
    // Push any DB schema changes
    execSync("npx prisma db push --skip-generate", { cwd, env: getEnv(), shell: true, stdio: "pipe", timeout: 30000 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("app-restart", () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle("app-get-version", () => {
  return { version: app.getVersion(), isDev };
});

// ─── App Lifecycle ─────────────────────────────────────────────────────

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  console.log("Starting TicketReselling...");
  console.log("Database:", getDatabasePath());

  // Show window immediately with splash — user sees the app right away
  createWindow();

  // Splash screen timeout — 60 seconds max
  splashTimeout = setTimeout(() => {
    dialog.showErrorBox(
      "TicketReselling — Startup Timeout",
      "TicketReselling took too long to start (60 seconds).\n\nPossible causes:\n- Next.js failed to compile\n- Database migration is stuck\n- Another process is blocking port " + PORT + "\n\nThe app will now quit."
    );
    cleanupAndQuit("splash screen timeout after 60s");
  }, 60000);

  // Boot everything in the background
  await initDatabase();
  startNextServer();

  try {
    await waitForServer();
    // Clear splash timeout — startup succeeded
    if (splashTimeout) { clearTimeout(splashTimeout); splashTimeout = null; }

    // Swap splash → real app once Next.js is ready
    navigateToApp();

    // Escape key closes the embedded browser from anywhere
    globalShortcut.register("Escape", () => {
      if (ticketBrowserView) closeBrowserView();
    });
  } catch (err) {
    if (splashTimeout) { clearTimeout(splashTimeout); splashTimeout = null; }
    console.error("Failed to start:", err.message);
    dialog.showErrorBox(
      "TicketReselling — Next.js Failed to Start",
      "Next.js failed to start. Check that no other TicketReselling is running.\n\nDetails: " + err.message
    );
    cleanupAndQuit("waitForServer failed");
  }
});

app.on("window-all-closed", () => {
  killProcessTree(nextProcess);
  nextProcess = null;
  app.quit();
});

app.on("before-quit", () => {
  if (splashTimeout) { clearTimeout(splashTimeout); splashTimeout = null; }
  killProcessTree(nextProcess);
  nextProcess = null;
});
