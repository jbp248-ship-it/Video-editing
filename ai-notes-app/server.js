const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");
const os = require("os");

const PORT = 3456;
const DIR = path.join(__dirname, "public");
const MIME = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".png":"image/png", ".json":"application/json" };

// ── Auto-update: pull latest from GitHub on startup ──
function autoUpdate() {
  try {
    const repoDir = path.join(__dirname, "..");
    execSync("git pull origin claude/scaffold-chrome-ai-notes-QNfAf --ff-only", { cwd: repoDir, stdio: "pipe", timeout: 15000 });
    console.log("  [Update] Pulled latest changes from GitHub");
  } catch (err) {
    console.log("  [Update] No updates available (or offline)");
  }
}

const server = http.createServer((req, res) => {
  // API endpoint for checking updates from the client
  if (req.url === "/api/update") {
    autoUpdate();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ updated: true }));
    return;
  }
  const file = path.join(DIR, req.url === "/" ? "index.html" : req.url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n  Justin's AI Note Taker running at ${url}\n`);

  // Auto-update on startup
  autoUpdate();

  // Open Chrome as app window
  const cmd = process.platform === "win32"
    ? `start chrome --app="${url}"`
    : process.platform === "darwin"
    ? `open -a "Google Chrome" --args --app="${url}"`
    : `google-chrome --app="${url}" 2>/dev/null || chromium --app="${url}"`;
  exec(cmd);

  // Create desktop shortcut (Windows)
  if (process.platform === "win32") {
    const bat = path.join(os.homedir(), "Desktop", "Justin's AI Note Taker.bat");
    if (!fs.existsSync(bat)) {
      fs.writeFileSync(bat, `@echo off\ncd /d "${__dirname}"\nstart /min cmd /c "node server.js"\n`);
      console.log(`  Desktop shortcut created!\n`);
    }
  }
});
