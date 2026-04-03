import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try multiple .env locations (handles different working directories on Windows)
const envPaths = [
  join(__dirname, '..', '..', '.env'),  // relative to server/lib/
  join(process.cwd(), '.env'),           // relative to where npm was run
];

function findEnv() {
  for (const p of envPaths) {
    if (existsSync(p)) return p;
  }
  return envPaths[0];
}

/**
 * Get an API key — checks process.env first, then reads .env file directly.
 * Handles Windows BOM encoding and \r\n line endings.
 */
export function getKey(name) {
  // Check process.env first
  if (process.env[name]) return process.env[name];

  // Fallback: read directly from .env file
  const envPath = findEnv();
  if (existsSync(envPath)) {
    let content = readFileSync(envPath, 'utf-8');
    // Strip BOM that PowerShell adds on Windows
    content = content.replace(/^\uFEFF/, '');
    // Split on both \r\n (Windows) and \n (Unix)
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key === name && val && !val.startsWith('your_')) {
        process.env[name] = val;
        return val;
      }
    }
  }

  return null;
}
