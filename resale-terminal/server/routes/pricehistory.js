import { Router } from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const HISTORY_FILE = join(DATA_DIR, 'price_history.json');

// Ensure data directory exists
mkdirSync(DATA_DIR, { recursive: true });

function readHistory() {
  try {
    if (existsSync(HISTORY_FILE)) {
      return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[pricehistory] Error reading history file:', err.message);
  }
  return {};
}

function writeHistory(data) {
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[pricehistory] Error writing history file:', err.message);
  }
}

const router = Router();

// POST /api/prices/snapshot — save a price snapshot
router.post('/snapshot', (req, res) => {
  const { eventKey, seatgeekFloor, seatgeekAvg, seatgeekHigh, listingCount, demandScore } = req.body;

  if (!eventKey) {
    return res.status(400).json({ error: 'Missing eventKey' });
  }

  const history = readHistory();
  if (!history[eventKey]) {
    history[eventKey] = [];
  }

  const snapshot = {
    timestamp: new Date().toISOString(),
    seatgeekFloor: seatgeekFloor || null,
    seatgeekAvg: seatgeekAvg || null,
    seatgeekHigh: seatgeekHigh || null,
    listingCount: listingCount || null,
    demandScore: demandScore || null,
  };

  // Avoid duplicate snapshots within the same hour
  const lastEntry = history[eventKey][history[eventKey].length - 1];
  if (lastEntry) {
    const lastTime = new Date(lastEntry.timestamp).getTime();
    const now = Date.now();
    if (now - lastTime < 3600000) {
      // Update existing entry instead of adding a new one
      history[eventKey][history[eventKey].length - 1] = snapshot;
      writeHistory(history);
      return res.json({ status: 'updated', eventKey, dataPoints: history[eventKey].length });
    }
  }

  // Keep max 100 snapshots per event
  if (history[eventKey].length >= 100) {
    history[eventKey].shift();
  }

  history[eventKey].push(snapshot);
  writeHistory(history);

  res.json({ status: 'saved', eventKey, dataPoints: history[eventKey].length });
});

// GET /api/prices/history?event=EVENT_KEY — get price history for an event
router.get('/history', (req, res) => {
  const eventKey = req.query.event;
  if (!eventKey) {
    return res.status(400).json({ error: 'Missing ?event= parameter' });
  }

  const history = readHistory();
  const entries = history[eventKey] || [];

  res.json({ eventKey, dataPoints: entries.length, history: entries });
});

// GET /api/prices/trend?event=EVENT_KEY — get trend analysis
router.get('/trend', (req, res) => {
  const eventKey = req.query.event;
  if (!eventKey) {
    return res.status(400).json({ error: 'Missing ?event= parameter' });
  }

  const history = readHistory();
  const entries = history[eventKey] || [];

  if (entries.length < 2) {
    return res.json({
      priceTrend: 'Insufficient Data',
      supplyTrend: 'Insufficient Data',
      priceChange7d: null,
      supplyChange7d: null,
      dataPoints: entries.length,
    });
  }

  // Find entries from ~7 days ago
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 3600000;
  const recentEntries = entries.filter(e => new Date(e.timestamp).getTime() > sevenDaysAgo);

  const oldest = recentEntries.length >= 2 ? recentEntries[0] : entries[entries.length - 2];
  const newest = entries[entries.length - 1];

  // Price trend
  let priceTrend = 'Stable';
  let priceChange7d = null;
  if (oldest.seatgeekFloor && newest.seatgeekFloor && oldest.seatgeekFloor > 0) {
    const pctChange = ((newest.seatgeekFloor - oldest.seatgeekFloor) / oldest.seatgeekFloor) * 100;
    priceChange7d = (pctChange >= 0 ? '+' : '') + pctChange.toFixed(1) + '%';
    if (pctChange > 3) priceTrend = 'Rising';
    else if (pctChange < -3) priceTrend = 'Falling';
  }

  // Supply trend
  let supplyTrend = 'Stable';
  let supplyChange7d = null;
  if (oldest.listingCount && newest.listingCount && oldest.listingCount > 0) {
    const pctChange = ((newest.listingCount - oldest.listingCount) / oldest.listingCount) * 100;
    supplyChange7d = (pctChange >= 0 ? '+' : '') + pctChange.toFixed(1) + '%';
    if (pctChange > 5) supplyTrend = 'Increasing';
    else if (pctChange < -5) supplyTrend = 'Decreasing';
  }

  res.json({
    priceTrend,
    supplyTrend,
    priceChange7d,
    supplyChange7d,
    dataPoints: entries.length,
  });
});

export default router;
