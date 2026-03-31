const { app, BrowserWindow, shell } = require("electron");
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

function killProcessTree(proc) {
  if (!proc || proc.killed) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: "pipe" });
    } catch (e) {
      // Process may have already exited
    }
  } else {
    proc.kill();
  }
}

function getProjectRoot() {
  if (isDev) {
    return path.join(__dirname, "..");
  }
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
      cwd: root,
      env,
      shell: true,
      stdio: "pipe",
      timeout: 30000,
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
    cwd: root,
    env,
    shell: true,
    stdio: "pipe",
  });

  nextProcess.stdout.on("data", (data) => {
    console.log(`[next] ${data.toString().trim()}`);
  });

  nextProcess.stderr.on("data", (data) => {
    console.error(`[next] ${data.toString().trim()}`);
  });

  nextProcess.on("close", (code) => {
    console.log(`Next.js exited with code ${code}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      app.quit();
    }
  });
}

function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      const req = http.get(`http://localhost:${PORT}`, (res) => {
        resolve();
        res.resume();
      });

      req.on("error", () => {
        if (attempts >= retries) {
          reject(new Error("Server did not start in time"));
        } else {
          setTimeout(check, 500);
        }
      });

      req.setTimeout(1000, () => {
        req.destroy();
        if (attempts >= retries) {
          reject(new Error("Server timed out"));
        } else {
          setTimeout(check, 500);
        }
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
    },
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  console.log("Starting TicketOps...");
  console.log("Database:", getDatabasePath());

  // Initialize database schema
  initDatabase();

  // Start Next.js server
  startNextServer();

  // Wait for server to be ready
  try {
    await waitForServer();
    createWindow();
  } catch (err) {
    console.error("Failed to start:", err.message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (nextProcess) {
    killProcessTree(nextProcess);
    nextProcess = null;
  }
  app.quit();
});

app.on("before-quit", () => {
  if (nextProcess) {
    killProcessTree(nextProcess);
    nextProcess = null;
  }
});
