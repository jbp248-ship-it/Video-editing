import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '..', '.env');

const router = Router();

// GET /api/settings — return current key values (masked)
router.get('/', (req, res) => {
  const keys = { ANTHROPIC_API_KEY: '', SEATGEEK_CLIENT_ID: '', TICKETMASTER_API_KEY: '' };
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const [key, ...rest] = line.split('=');
      const val = rest.join('=').trim();
      if (key && key.trim() in keys && val && !val.startsWith('your_')) {
        keys[key.trim()] = val;
      }
    }
  }
  res.json(keys);
});

// POST /api/settings — write keys to .env file
router.post('/', (req, res) => {
  const { ANTHROPIC_API_KEY, SEATGEEK_CLIENT_ID, TICKETMASTER_API_KEY } = req.body;

  // Read existing .env or start fresh
  let lines = existsSync(envPath)
    ? readFileSync(envPath, 'utf-8').split('\n')
    : ['PORT=3001'];

  const updates = { ANTHROPIC_API_KEY, SEATGEEK_CLIENT_ID, TICKETMASTER_API_KEY };

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
