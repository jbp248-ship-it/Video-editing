const { app, BrowserWindow, BrowserView, ipcMain, shell, session } = require("electron");
const { spawn, execSync } = require("child_process");
const path = require("path");
const http = require("http");

// Enforce single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const PORT = 3099;
const isDev = !app.isPackaged;
let mainWindow = null;
let nextProcess = null;
let ticketBrowserView = null;

function killProcessTree(proc) {
  if (!proc || proc.killed) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: "pipe" });
    } catch (e) {}
  } else {
    proc.kill();
  }
}

function getProjectRoot() {
  if (isDev) return path.join(__dirname, "..");
  return path.join(process.resourcesPath, "app");
}

function getDatabasePath() {
  const userDataDir = app.getPath("userData");
  return `file:${path.join(userDataDir, "ticketops.db")}`;
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
  const root = getProjectRoot();
  const env = getEnv();
  try {
    execSync("npx prisma db push --skip-generate", {
      cwd: root, env, shell: true, stdio: "pipe", timeout: 30000,
    });
    console.log("Database initialized at:", getDatabasePath());
  } catch (err) {
    console.error("Database init failed:", err.message);
  }
}

function startNextServer() {
  const root = getProjectRoot();
  const env = getEnv();
  const cmd = isDev ? "dev" : "start";
  nextProcess = spawn("npx", ["next", cmd, "-p", String(PORT)], {
    cwd: root, env, shell: true, stdio: "pipe",
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
      const req = http.get(`http://localhost:${PORT}`, (res) => {
        if (res.statusCode === 200) resolve();
        else setTimeout(check, 500);
        res.resume();
      });
      req.on("error", () => {
        if (attempts >= retries) reject(new Error("Server did not start in time"));
        else setTimeout(check, 500);
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts >= retries) reject(new Error("Server timed out"));
        else setTimeout(check, 500);
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "TicketOps",
    backgroundColor: "#0f172a",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.on("resize", () => resizeBrowserView());
}

// ─── Embedded Browser (BrowserView) for ticket site browsing ──────────

function resizeBrowserView() {
  if (!ticketBrowserView || !mainWindow) return;
  const bounds = mainWindow.getContentBounds();
  // Layout: sidebar (224px) | browser | data panel (380px)
  // Browser toolbar is 44px tall
  const sidebarWidth = 224;
  const dataPanelWidth = 380;
  const toolbarHeight = 44;
  ticketBrowserView.setBounds({
    x: sidebarWidth,
    y: toolbarHeight,
    width: Math.max(400, bounds.width - sidebarWidth - dataPanelWidth),
    height: bounds.height - toolbarHeight,
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

  // Intercept network responses for ticket data
  wc.session.webRequest.onCompleted(
    { urls: ["*://*/*"] },
    (details) => {
      if (
        details.statusCode === 200 &&
        details.resourceType === "xhr" &&
        details.responseHeaders &&
        (details.responseHeaders["content-type"] ?? details.responseHeaders["Content-Type"] ?? [])
          .some((ct) => ct.includes("json"))
      ) {
        // Can't read body from onCompleted, but we log the URL
        // The actual data extraction happens via executeJavaScript below
      }
    }
  );

  // Inject a capture script after each page load
  wc.on("did-finish-load", () => {
    injectCaptureScript(wc);
  });

  // Also inject after in-page navigation (SPA sites)
  wc.on("did-navigate-in-page", () => {
    setTimeout(() => injectCaptureScript(wc), 2000);
  });

  // Track URL changes
  wc.on("did-navigate", (event, navUrl) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("browser-url-changed", navUrl);
    }
  });
  wc.on("did-navigate-in-page", (event, navUrl) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("browser-url-changed", navUrl);
    }
  });

  // Track loading state
  wc.on("did-start-loading", () => {
    mainWindow?.webContents.send("browser-loading", true);
  });
  wc.on("did-stop-loading", () => {
    mainWindow?.webContents.send("browser-loading", false);
  });

  // Get page title
  wc.on("page-title-updated", (event, title) => {
    mainWindow?.webContents.send("browser-title-changed", title);
  });

  wc.loadURL(url);
}

/**
 * Inject a script into the BrowserView that intercepts XHR/fetch
 * responses and extracts ticket data, then posts it back via IPC.
 */
function injectCaptureScript(wc) {
  wc.executeJavaScript(`
    (function() {
      if (window.__ticketOpsInjected) return;
      window.__ticketOpsInjected = true;

      const captured = { listings: [], eventName: '', platform: '' };

      function detectPlatform() {
        const h = location.hostname;
        if (h.includes('stubhub.com')) return 'STUBHUB';
        if (h.includes('ticketmaster.com')) return 'TICKETMASTER';
        if (h.includes('vividseats.com')) return 'VIVID_SEATS';
        if (h.includes('seatgeek.com')) return 'SEATGEEK';
        if (h.includes('etix.com')) return 'ETIX';
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
              priceWithFees: toNum(obj.PriceWithFees || obj.priceWithFees || obj.allInPrice) || null
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
            if (this.responseText && this.responseText.length > 50) {
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
              if (text.length > 50) {
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

      // Check __NEXT_DATA__
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

        // DOM fallback — find $XX text nodes
        try {
          var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: function(n) {
              return /^\\$\\s?[\\d,]+(\\.\\d{2})?$/.test(n.textContent.trim())
                ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
            }
          });
          var node, domListings = [];
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
                domListings.push({
                  price: p, section: sm ? sm[1] : '', row: rm ? rm[1] : '',
                  quantity: 1, priceWithFees: null
                });
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
                domListings.push({
                  price: p, section: sm ? sm[1] : '', row: rm ? rm[1] : '',
                  quantity: 1, priceWithFees: null
                });
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
          // Deduplicate
          var seen = {};
          var unique = captured.listings.filter(function(l) {
            var k = l.price + '-' + l.section + '-' + l.row;
            if (seen[k]) return false;
            seen[k] = true;
            return true;
          });
          captured.listings = unique;

          // Post to main process via title hack (contextIsolation blocks IPC)
          document.title = '__TICKETOPS__' + JSON.stringify({
            platform: captured.platform,
            eventName: captured.eventName.replace(/(\\s*[-|]\\s*(StubHub|Ticketmaster|Vivid|SeatGeek|Etix).*$)/i, '').trim(),
            url: location.href,
            listings: unique.slice(0, 500),
            count: unique.length
          });
        }, 1000);
      }
    })();
  `).catch(() => {});
}

// ─── IPC Handlers ──────────────────────────────────────────────────────

ipcMain.handle("browser-navigate", (event, url) => {
  if (!url.startsWith("http")) url = "https://" + url;
  createBrowserView(url);
  return true;
});

ipcMain.handle("browser-back", () => {
  if (ticketBrowserView?.webContents.canGoBack()) {
    ticketBrowserView.webContents.goBack();
  }
});

ipcMain.handle("browser-forward", () => {
  if (ticketBrowserView?.webContents.canGoForward()) {
    ticketBrowserView.webContents.goForward();
  }
});

ipcMain.handle("browser-refresh", () => {
  ticketBrowserView?.webContents.reload();
});

ipcMain.handle("browser-close", () => {
  if (ticketBrowserView && mainWindow) {
    mainWindow.removeBrowserView(ticketBrowserView);
    ticketBrowserView.webContents.destroy();
    ticketBrowserView = null;
  }
});

// Listen for title changes that contain captured data
ipcMain.handle("browser-get-data", async () => {
  if (!ticketBrowserView) return null;
  try {
    const title = await ticketBrowserView.webContents.executeJavaScript("document.title");
    if (title.startsWith("__TICKETOPS__")) {
      return JSON.parse(title.replace("__TICKETOPS__", ""));
    }
  } catch {}
  return null;
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
  initDatabase();
  startNextServer();
  try {
    await waitForServer();
    createWindow();
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
