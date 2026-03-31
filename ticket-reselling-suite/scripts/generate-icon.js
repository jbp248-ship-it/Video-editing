/**
 * Generate app icon PNG from SVG.
 * Run: node scripts/generate-icon.js
 * Requires: npm install sharp (one-time)
 */
const fs = require("fs");
const path = require("path");

async function main() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.log("Installing sharp for icon generation...");
    require("child_process").execSync("npm install sharp --no-save", {
      stdio: "inherit",
    });
    sharp = require("sharp");
  }

  const svgPath = path.join(__dirname, "..", "public", "icon.svg");
  const svg = fs.readFileSync(svgPath);

  // Generate multiple sizes
  const sizes = [16, 32, 48, 64, 128, 256, 512];
  for (const size of sizes) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, "..", "public", `icon${size}.png`));
    console.log(`Generated icon${size}.png`);
  }

  // Main icon for electron-builder
  await sharp(svg)
    .resize(512, 512)
    .png()
    .toFile(path.join(__dirname, "..", "public", "icon.png"));
  console.log("Generated icon.png (512x512)");
}

main().catch(console.error);
