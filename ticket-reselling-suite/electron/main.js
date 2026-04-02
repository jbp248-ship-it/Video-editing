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

function killProcessTree(proc) {
  if (!proc || proc.killed) return;
  if (process.platform === "win32") {
    try { execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: "pipe" }); } catch {}
  } else {
    proc.kill();
  }
}

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

function initDatabase() {
  try {
    execSync("npx prisma db push --skip-generate", {
      cwd: getProjectRoot(), env: getEnv(), shell: true, stdio: "pipe", timeout: 30000,
    });
    console.log("Database initialized at:", getDatabasePath());
  } catch (err) {
    console.error("Database init failed:", err.message);
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

function startNextServer() {
  const cmd = isDev ? "dev" : "start";
  nextProcess = spawn("npx", ["next", cmd, "-p", String(PORT)], {
    cwd: getProjectRoot(), env: getEnv(), shell: true, stdio: "pipe",
  });
  nextProcess.stdout.on("data", (d) => console.log(`[next] ${d.toString().trim()}`));
  nextProcess.stderr.on("data", (d) => console.error(`[next] ${d.toString().trim()}`));
  nextProcess.on("close", (code) => {
    console.log(`Next.js exited with code ${code}`);
    if (mainWindow && !mainWindow.isDestroyed()) app.quit();
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
        if (res.statusCode === 200) resolve();
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
    title: "TicketOps", backgroundColor: "#FAF9F6",
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

        // DOM fallback
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
            totalTicketsRemaining: hasRemaining ? totalRemaining : null
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

// ─── App Lifecycle ─────────────────────────────────────────────────────

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  console.log("Starting TicketOps...");
  console.log("Database:", getDatabasePath());

  // Show window immediately with splash — user sees the app right away
  createWindow();

  // Check port availability before starting
  const portFree = await isPortFree(PORT);
  if (!portFree) {
    dialog.showErrorBox(
      "TicketOps — Port In Use",
      `Port ${PORT} is already in use. Close any other TicketOps window and try again.`
    );
    app.quit();
    return;
  }

  // Boot everything in the background
  initDatabase();
  startNextServer();

  try {
    await waitForServer();
    // Swap splash → real app once Next.js is ready
    navigateToApp();

    // Escape key closes the embedded browser from anywhere
    globalShortcut.register("Escape", () => {
      if (ticketBrowserView) closeBrowserView();
    });
  } catch (err) {
    console.error("Failed to start:", err.message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  killProcessTree(nextProcess);
  nextProcess = null;
  app.quit();
});

app.on("before-quit", () => {
  killProcessTree(nextProcess);
  nextProcess = null;
});
