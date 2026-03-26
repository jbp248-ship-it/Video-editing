/**
 * Downloads the Xenova/whisper-tiny.en ONNX model and tokenizer files
 * into the local /models folder so the extension can run fully offline.
 *
 * Features:
 *   - Skips files that are already cached
 *   - Shows download progress with file sizes
 *   - Retries failed downloads (3 attempts with backoff)
 *   - Graceful failure: warns but doesn't crash npm install
 *
 * Run manually:  node scripts/download-model.mjs
 * Runs automatically after `npm install` via the postinstall hook.
 */

import { mkdir, writeFile, access, stat } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = join(__dirname, "..", "models", "Xenova", "whisper-tiny.en");

const HF_BASE =
  "https://huggingface.co/Xenova/whisper-tiny.en/resolve/main";

// Files required for offline Whisper inference
const FILES = [
  "onnx/encoder_model.onnx",
  "onnx/decoder_model_merged.onnx",
  "config.json",
  "generation_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "preprocessor_config.json",
];

const MAX_RETRIES = 3;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function download(file) {
  const url = `${HF_BASE}/${file}`;
  const dest = join(MODELS_DIR, file);

  // Skip if already downloaded
  try {
    await access(dest);
    const info = await stat(dest);
    console.log(`  ✓ ${file} (cached, ${formatBytes(info.size)})`);
    return true;
  } catch {
    // File doesn't exist — download it
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const label = attempt > 1 ? ` (retry ${attempt}/${MAX_RETRIES})` : "";
      console.log(`  ↓ Downloading ${file}...${label}`);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await mkdir(dirname(dest), { recursive: true });
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buffer);
      console.log(`  ✓ ${file} (${formatBytes(buffer.length)})`);
      return true;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 2000;
        console.log(`  ⚠ Failed: ${err.message}. Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      } else {
        console.error(`  ✗ Failed to download ${file} after ${MAX_RETRIES} attempts: ${err.message}`);
        return false;
      }
    }
  }
}

async function main() {
  console.log("Downloading Xenova/whisper-tiny.en model files...\n");

  let allOk = true;
  for (const file of FILES) {
    const ok = await download(file);
    if (!ok) allOk = false;
  }

  console.log("");
  if (allOk) {
    console.log("All model files are ready in /models.");
  } else {
    console.log("⚠ Some files failed to download. The extension will work");
    console.log("  but Whisper transcription won't function until you re-run:");
    console.log("  npm run download-model");
    // Exit 0 so npm install doesn't fail
  }
}

main().catch((err) => {
  // Don't crash npm install if the network is down
  console.error("⚠ Model download failed:", err.message);
  console.error("  Run 'npm run download-model' later when you have internet.");
});
