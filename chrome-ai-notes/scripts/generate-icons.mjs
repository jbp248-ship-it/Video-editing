/**
 * Generates PNG extension icons from an inline SVG.
 * No external image tools required — uses pure Node canvas-free approach:
 * writes SVG files that Chrome can use, plus a script to convert via
 * the browser if needed.
 *
 * For Chrome extensions, SVG icons aren't supported in manifest.json,
 * so we generate minimal valid PNGs using a raw binary approach.
 */

import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "icons");

/**
 * Generate a minimal valid PNG file with a solid colored circle
 * on a transparent background. Pure Node.js — no dependencies.
 *
 * This creates a simple but recognizable icon: a blue circle with
 * a white "N" shape (for "Notes") using raw pixel manipulation.
 */
function createPNG(size) {
  // PNG file structure
  const width = size;
  const height = size;

  // Raw RGBA pixel data
  const pixels = Buffer.alloc(width * height * 4, 0); // transparent

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.42;
  const innerRadius = radius * 0.65;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = (y * width + x) * 4;

      if (dist <= radius) {
        // Blue circle background: #2563EB
        pixels[offset] = 37;     // R
        pixels[offset + 1] = 99;  // G
        pixels[offset + 2] = 235; // B
        pixels[offset + 3] = 255; // A

        // Draw a white "N" in the center
        const nx = (x - cx) / radius;  // normalized -1 to 1
        const ny = (y - cy) / radius;

        const inN =
          // Left vertical stroke
          (nx >= -0.35 && nx <= -0.15 && ny >= -0.4 && ny <= 0.4) ||
          // Right vertical stroke
          (nx >= 0.15 && nx <= 0.35 && ny >= -0.4 && ny <= 0.4) ||
          // Diagonal stroke (connects top-left to bottom-right)
          (Math.abs(nx - (-0.35 + (ny + 0.4) * 0.7 / 0.8)) <= 0.12 &&
           ny >= -0.4 && ny <= 0.4);

        if (inN) {
          pixels[offset] = 255;     // R
          pixels[offset + 1] = 255; // G
          pixels[offset + 2] = 255; // B
          pixels[offset + 3] = 255; // A
        }
      }
    }
  }

  return encodePNG(width, height, pixels);
}

// ── Minimal PNG encoder (no dependencies) ──

function encodePNG(width, height, rgbaPixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk("IHDR", ihdrData);

  // IDAT chunk — raw pixel data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    rgbaPixels.copy(
      rawData,
      y * (1 + width * 4) + 1,
      y * width * 4,
      (y + 1) * width * 4
    );
  }

  const { deflateSync } = await_import_zlib();
  const compressed = deflateSync(rawData);
  const idat = createChunk("IDAT", compressed);

  // IEND chunk
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function await_import_zlib() {
  // Dynamic import workaround for top-level await
  const zlib = require("zlib");
  return zlib;
}

// Use createRequire for ESM compatibility
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ── Main ──

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  const sizes = [16, 48, 128];

  for (const size of sizes) {
    const png = createPNG(size);
    const path = join(ICONS_DIR, `icon-${size}.png`);
    await writeFile(path, png);
    console.log(`  ✓ icon-${size}.png (${png.length} bytes)`);
  }

  console.log("\nIcons generated in /icons.");
}

main().catch(console.error);
