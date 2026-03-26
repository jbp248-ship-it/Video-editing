/**
 * Downloads the Xenova/whisper-tiny.en ONNX model and tokenizer files
 * into the local /models folder so the extension can run fully offline.
 *
 * Run manually:  node scripts/download-model.mjs
 * Runs automatically after `npm install` via the postinstall hook.
 */

import { mkdir, writeFile, access } from "fs/promises";
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

async function download(file) {
  const url = `${HF_BASE}/${file}`;
  const dest = join(MODELS_DIR, file);

  // Skip if already downloaded
  try {
    await access(dest);
    console.log(`  ✓ ${file} (cached)`);
    return;
  } catch {
    // File doesn't exist — download it
  }

  console.log(`  ↓ Downloading ${file}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

  await mkdir(dirname(dest), { recursive: true });
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buffer);
  console.log(`  ✓ ${file}`);
}

console.log("Downloading Xenova/whisper-tiny.en model files...\n");
for (const file of FILES) {
  await download(file);
}
console.log("\nAll model files are ready in /models.");
