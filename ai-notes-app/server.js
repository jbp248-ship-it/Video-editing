/**
 * AI Note Taker — Local Web App Server
 * Opens in Chrome. Auto-creates desktop shortcut on first run.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");

const PORT = 3456;
const DIR = path.join(__dirname, "public");
const MIME = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".png":"image/png", ".json":"application/json", ".svg":"image/svg+xml" };

const server = http.createServer((req, res) => {
  const file = path.join(DIR, req.url === "/" ? "index.html" : req.url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n  AI Note Taker running at ${url}\n`);

  // Open in Chrome as an app window (--app flag removes address bar)
  const chromeCmd = process.platform === "win32"
    ? `start chrome --app="${url}"`
    : process.platform === "darwin"
    ? `open -a "Google Chrome" --args --app="${url}"`
    : `google-chrome --app="${url}" 2>/dev/null || chromium --app="${url}"`;
  exec(chromeCmd);

  // Create desktop shortcut (Windows)
  if (process.platform === "win32") {
    createWindowsShortcut(url);
  }
});

function createWindowsShortcut(url) {
  const desktop = path.join(os.homedir(), "Desktop");
  const shortcutPath = path.join(desktop, "AI Note Taker.url");

  // Only create once
  if (fs.existsSync(shortcutPath)) return;

  const content = `[InternetShortcut]\nURL=javascript:void(0)\n[Shell]\nCommand=open\n`;
  // .url shortcut doesn't support starting a server, so create a .bat instead
  const batPath = path.join(desktop, "AI Note Taker.bat");
  if (fs.existsSync(batPath)) return;

  const bat = `@echo off\ncd /d "${__dirname}"\nstart /min cmd /c "node server.js"\ntimeout /t 2 /nobreak >nul\nstart chrome --app="http://127.0.0.1:${PORT}"\n`;
  try {
    fs.writeFileSync(batPath, bat);
    console.log(`  Desktop shortcut created: ${batPath}\n`);
  } catch (err) {
    console.log(`  Could not create shortcut: ${err.message}\n`);
  }
}
