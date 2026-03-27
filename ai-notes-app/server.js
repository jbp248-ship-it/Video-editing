/**
 * AI Note Taker — Local Web App
 *
 * Runs a tiny local server, opens in your real Chrome browser.
 * Chrome's Web Speech API works perfectly here (unlike in Electron).
 * Instant transcription, zero delay.
 *
 * Usage: node server.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = 3456;
const DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const file = path.join(DIR, req.url === "/" ? "index.html" : req.url);
  const ext = path.extname(file);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n  AI Note Taker running at ${url}\n`);

  // Open in Chrome
  const cmd = process.platform === "win32"
    ? `start chrome "${url}"`
    : process.platform === "darwin"
    ? `open -a "Google Chrome" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd);
});
