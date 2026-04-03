import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '..', '.env');

/**
 * Get an API key — checks process.env first, then reads .env file directly.
 * This ensures keys saved via the Settings page are always available,
 * even if the hot-reload into process.env didn't stick.
 */
export function getKey(name) {
  // Check process.env first
  if (process.env[name]) return process.env[name];

  // Fallback: read directly from .env file
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key === name && val && !val.startsWith('your_')) {
        // Cache it in process.env for future calls
        process.env[name] = val;
        return val;
      }
    }
  }

  return null;
}
