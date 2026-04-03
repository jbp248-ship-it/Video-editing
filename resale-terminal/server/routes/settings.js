import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '..', '.env');

const router = Router();

// GET /api/settings — return current key values
router.get('/', (req, res) => {
  const keys = { ANTHROPIC_API_KEY: '', SEATGEEK_CLIENT_ID: '', TICKETMASTER_API_KEY: '', TICKETSDATA_EMAIL: '', TICKETSDATA_PASSWORD: '' };
  if (existsSync(envPath)) {
    let content = readFileSync(envPath, 'utf-8');
    // Strip BOM that PowerShell adds on Windows
    content = content.replace(/^\uFEFF/, '');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key in keys && val && !val.startsWith('your_')) {
        keys[key] = val;
      }
    }
  }
  res.json(keys);
});

// POST /api/settings — write keys to .env file
router.post('/', (req, res) => {
  const { ANTHROPIC_API_KEY, SEATGEEK_CLIENT_ID, TICKETMASTER_API_KEY, TICKETSDATA_EMAIL, TICKETSDATA_PASSWORD } = req.body;

  // Read existing .env or start fresh (handle Windows BOM + line endings)
  let lines;
  if (existsSync(envPath)) {
    let content = readFileSync(envPath, 'utf-8').replace(/^\uFEFF/, '');
    lines = content.split(/\r?\n/).filter(Boolean);
  } else {
    lines = ['PORT=3001'];
  }

  const updates = { ANTHROPIC_API_KEY, SEATGEEK_CLIENT_ID, TICKETMASTER_API_KEY, TICKETSDATA_EMAIL, TICKETSDATA_PASSWORD };

  for (const [key, val] of Object.entries(updates)) {
    if (!val) continue;
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (idx >= 0) {
      lines[idx] = `${key}=${val}`;
    } else {
      lines.push(`${key}=${val}`);
    }
  }

  // Ensure PORT line exists
  if (!lines.some((l) => l.startsWith('PORT='))) lines.push('PORT=3001');

  writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n', 'utf-8');

  // Hot-reload env vars into current process
  for (const [key, val] of Object.entries(updates)) {
    if (val) process.env[key] = val;
  }

  res.json({ ok: true });
});

export default router;
