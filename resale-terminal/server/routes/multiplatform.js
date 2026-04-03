import { Router } from 'express';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getKey } from '../lib/getKey.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, '..', 'scripts', 'fetch_tickets.py');

const router = Router();

/**
 * POST /api/multiplatform/fetch
 * Body: { event_name, event_urls: { ticketmaster?: url, stubhub?: url, seatgeek?: url, ... } }
 *
 * Calls the Python TicketsData client to fetch listings from multiple platforms.
 * Requires TICKETSDATA_EMAIL and TICKETSDATA_PASSWORD in .env
 */
router.post('/fetch', async (req, res) => {
  try {
    const email = getKey('TICKETSDATA_EMAIL');
    const password = getKey('TICKETSDATA_PASSWORD');

    if (!email || !password) {
      return res.status(400).json({
        error: 'TicketsData credentials not configured. Add TICKETSDATA_EMAIL and TICKETSDATA_PASSWORD in Settings.',
        needsSetup: true,
      });
    }

    const { event_urls = {} } = req.body;

    // Build platform jobs from provided URLs
    const platforms = [];
    for (const [platform, url] of Object.entries(event_urls)) {
      if (url) {
        platforms.push({ platform, event_url: url });
      }
    }

    if (platforms.length === 0) {
      return res.status(400).json({ error: 'No event URLs provided' });
    }

    const input = JSON.stringify({ email, password, platforms });

    // Spawn Python process
    const result = await new Promise((resolve, reject) => {
      const py = spawn('python3', [scriptPath], { timeout: 60000 });
      let stdout = '';
      let stderr = '';

      py.stdout.on('data', (data) => { stdout += data; });
      py.stderr.on('data', (data) => { stderr += data; });

      py.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `Python script exited with code ${code}`));
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error('Failed to parse Python output'));
          }
        }
      });

      py.on('error', (err) => reject(err));
      py.stdin.write(input);
      py.stdin.end();
    });

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error('Multi-platform fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/multiplatform/status
 * Returns whether TicketsData credentials are configured.
 */
router.get('/status', (req, res) => {
  const email = getKey('TICKETSDATA_EMAIL');
  const password = getKey('TICKETSDATA_PASSWORD');
  res.json({
    configured: !!(email && password),
    service: 'TicketsData',
    platforms: ['ticketmaster', 'stubhub', 'seatgeek', 'vividseats', 'tickpick', 'gametime', 'viagogo'],
  });
});

export default router;
