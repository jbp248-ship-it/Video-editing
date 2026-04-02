/**
 * TicketOps Desktop — Electron Main Process
 *
 * Spawns the Python Flask backend, shows a splash screen while it
 * starts up, then loads the web UI in a proper desktop window.
 * Minimises to system tray on close; fully quits from tray menu.
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  dialog,
} = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

let splashWindow = null;
let mainWindow = null;
let tray = null;
let flaskProcess = null;
let flaskPort = 5000;
let isQuitting = false;

const PORT_RANGE_START = 5000;
const PORT_RANGE_END = 5010;
const POLL_INTERVAL_MS = 500;
const STARTUP_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function backendDir() {
  // In packaged builds the backend lives in resources/backend.
  // During development it is one directory up from desktop/.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend');
  }
  return path.resolve(__dirname, '..');
}

function iconPath() {
  return path.join(__dirname, 'assets', 'icon.svg');
}

function pythonCommand() {
  // Prefer python3, fall back to python (Windows).
  if (process.platform === 'win32') return 'python';
  return 'python3';
}

// ---------------------------------------------------------------------------
// Port helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a port is responding with an HTTP 200.
 */
function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Try to find a free port in the range. Returns the first port that
 * is NOT already responding (i.e. available).
 */
async function findAvailablePort() {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    const inUse = await checkPort(port);
    if (!inUse) return port;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Splash screen
// ---------------------------------------------------------------------------

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#0f0c29',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow.show());
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: iconPath(),
    title: 'TicketOps',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${flaskPort}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  // Minimise to tray instead of quitting.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------

function createTray() {
  let trayIcon;
  try {
    const svgPath = iconPath();
    if (fs.existsSync(svgPath)) {
      trayIcon = nativeImage.createFromPath(svgPath);
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    }
  } catch {
    // Ignore — will fall through to empty image.
  }

  if (!trayIcon || trayIcon.isEmpty()) {
    // Create a tiny 16x16 purple square as fallback.
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('TicketOps — Video Clipper');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Hide',
      click: () => {
        if (mainWindow) mainWindow.hide();
      },
    },
    { type: 'separator' },
    {
      label: 'Check for Updates...',
      click: () => checkForUpdates(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// Flask backend
// ---------------------------------------------------------------------------

function startFlask(port) {
  const env = { ...process.env, FLASK_PORT: String(port) };

  // Some Flask apps honour the PORT env var or FLASK_RUN_PORT.
  env.PORT = String(port);
  env.FLASK_RUN_PORT = String(port);

  // Suppress Python buffering so we can detect output quickly.
  env.PYTHONUNBUFFERED = '1';

  const appPath = path.join(backendDir(), 'app.py');

  flaskProcess = spawn(pythonCommand(), [appPath, '--port', String(port), '--no-browser'], {
    cwd: backendDir(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // On Windows, spawn inside a shell so python is found on PATH.
    shell: process.platform === 'win32',
    windowsHide: true,
  });

  // Silently consume stdout / stderr — never shown to the user.
  flaskProcess.stdout.on('data', () => {});
  flaskProcess.stderr.on('data', () => {});

  flaskProcess.on('error', (err) => {
    console.error('[TicketOps] Failed to start Flask:', err.message);
    sendSplashError(`Could not start backend: ${err.message}`);
  });

  flaskProcess.on('exit', (code, signal) => {
    console.log(`[TicketOps] Flask exited (code=${code}, signal=${signal})`);
    flaskProcess = null;

    // If the app is not quitting, the backend crashed — tell the user.
    if (!isQuitting) {
      sendSplashError('Backend process exited unexpectedly.');
    }
  });
}

function killFlask() {
  if (!flaskProcess) return;

  try {
    if (process.platform === 'win32') {
      // On Windows, kill the entire process tree.
      spawn('taskkill', ['/pid', String(flaskProcess.pid), '/f', '/t'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      // Send SIGTERM first, then SIGKILL after a brief grace period.
      flaskProcess.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (flaskProcess) flaskProcess.kill('SIGKILL');
        } catch {
          // Already dead — ignore.
        }
      }, 2000);
    }
  } catch {
    // Process may already be gone.
  }

  flaskProcess = null;
}

// ---------------------------------------------------------------------------
// Polling — wait for Flask to be ready
// ---------------------------------------------------------------------------

function waitForFlask(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const poll = () => {
      if (Date.now() > deadline) {
        return reject(new Error('Timed out waiting for backend to start.'));
      }

      checkPort(port).then((ok) => {
        if (ok) return resolve();
        setTimeout(poll, POLL_INTERVAL_MS);
      });
    };

    poll();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendSplashError(message) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('backend:error', message);
  }
}

// ---------------------------------------------------------------------------
// Auto-update
// ---------------------------------------------------------------------------

/**
 * Check for updates by querying the Flask backend.
 * If an update is available, show a native dialog and let the user decide.
 */
async function checkForUpdates() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  try {
    const data = await new Promise((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${flaskPort}/api/check-update`,
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });

    if (!data.update_available) return;

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'TicketOps Update Available',
      message: `A new version is available (${data.commits_behind} commits behind). Would you like to update now?`,
      buttons: ['Update Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response !== 0) return;

    // POST /api/update
    await httpPost(`http://127.0.0.1:${flaskPort}/api/update`);

    // POST /api/restart
    await httpPost(`http://127.0.0.1:${flaskPort}/api/restart`);

    // Wait for Flask to come back up, then reload the window.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  } catch (err) {
    console.error('[TicketOps] Update check failed:', err.message);
  }
}

/**
 * Simple helper to send an HTTP POST with no body.
 */
function httpPost(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(
      { hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname, method: 'POST' },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:check-updates', () => checkForUpdates());
ipcMain.on('app:quit', () => {
  isQuitting = true;
  app.quit();
});
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // 1. Show splash immediately.
  createSplashWindow();

  // 2. Set up tray.
  createTray();

  // 3. Find an available port.
  flaskPort = await findAvailablePort();
  if (flaskPort === null) {
    sendSplashError('All ports 5000-5010 are in use. Please free one and retry.');
    return;
  }

  // 4. Start the Flask backend.
  startFlask(flaskPort);

  // 5. Poll until Flask is responding.
  try {
    await waitForFlask(flaskPort, STARTUP_TIMEOUT_MS);
  } catch {
    sendSplashError('Backend failed to start. Check your Python environment.');
    return;
  }

  // 6. Show the main window.
  createMainWindow();

  // 7. Check for updates in the background.
  checkForUpdates();
});

app.on('activate', () => {
  // macOS: re-show window when dock icon is clicked.
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  killFlask();
});

app.on('will-quit', () => {
  killFlask();
});

app.on('window-all-closed', () => {
  // On macOS, keep the app in the dock unless the user explicitly quits.
  if (process.platform !== 'darwin') {
    // Do nothing — the tray keeps the app alive.
  }
});

// Catch-all to ensure the backend is cleaned up.
process.on('exit', killFlask);
process.on('SIGINT', () => {
  killFlask();
  process.exit(0);
});
process.on('SIGTERM', () => {
  killFlask();
  process.exit(0);
});
