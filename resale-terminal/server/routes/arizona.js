import { Router } from 'express';
import { getKey } from '../lib/getKey.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { calculateVelocity } from '../lib/velocity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const TRACKER_FILE = join(DATA_DIR, 'arizona_tracker.json');

const router = Router();

// Ensure data directory exists
mkdirSync(DATA_DIR, { recursive: true });

function loadTracker() {
  if (existsSync(TRACKER_FILE)) {
    return JSON.parse(readFileSync(TRACKER_FILE, 'utf-8'));
  }
  return { lastScan: null, events: {} };
}

function saveTracker(data) {
  writeFileSync(TRACKER_FILE, JSON.stringify(data, null, 2));
}

function makeEventKey(name, venue, date) {
  const n = (name || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const v = (venue || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const d = (date || '').slice(0, 10);
  return `${n}::${v}::${d}`;
}

function classifyVenueSize(capacity) {
  if (!capacity) return 'Unknown';
  if (capacity <= 500) return 'Intimate';
  if (capacity <= 3000) return 'Small';
  if (capacity <= 10000) return 'Medium';
  if (capacity <= 25000) return 'Large';
  return 'Arena';
}

function computeSupplyRatio(listingCount, capacity) {
  if (!capacity || !listingCount) return null;
  return Math.round((listingCount / capacity) * 100 * 10) / 10;
}

function computeDemandScore(seatgeekScore, listingCount, capacity) {
  let score = 50;
  if (seatgeekScore != null) score = Math.round(seatgeekScore * 100);
  if (capacity && listingCount) {
    const ratio = listingCount / capacity;
    if (ratio < 0.02) score = Math.min(100, score + 20);
    else if (ratio > 0.15) score = Math.max(0, score - 15);
  }
  return Math.max(0, Math.min(100, score));
}

function classifySelloutLikelihood(demandScore, supplyRatio) {
  if (demandScore >= 80 || (supplyRatio != null && supplyRatio < 2)) return 'High';
  if (demandScore >= 50 || (supplyRatio != null && supplyRatio < 8)) return 'Medium';
  return 'Low';
}

async function fetchSeatGeekEvents() {
  const clientId = getKey('SEATGEEK_CLIENT_ID');
  if (!clientId) return [];
  const url = `https://api.seatgeek.com/2/events?venue.state=AZ&type=concert&per_page=50&sort=datetime_utc.asc&client_id=${clientId}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.events || []).map(ev => {
    const venue = ev.venue || {};
    const stats = ev.stats || {};
    const capacity = venue.capacity || null;
    const listingCount = stats.listing_count || 0;
    const supplyRatio = computeSupplyRatio(listingCount, capacity);
    const demandScore = computeDemandScore(ev.score, listingCount, capacity);
    return {
      id: `sg_${ev.id}`,
      name: ev.title || ev.short_title,
      date: (ev.datetime_utc || '').slice(0, 10),
      venue: venue.name || 'Unknown',
      city: venue.city || 'Unknown',
      venueCapacity: capacity,
      venueSize: classifyVenueSize(capacity),
      seatgeekPrice: stats.lowest_price || null,
      seatgeekAvgPrice: stats.average_price || null,
      listingCount,
      ticketmasterPrice: null,
      saleStatus: 'onsale',
      supplyRatio,
      selloutLikelihood: classifySelloutLikelihood(demandScore, supplyRatio),
      demandScore,
      seatgeekScore: ev.score || null,
      seatgeekEventId: String(ev.id),
      sources: ['seatgeek'],
      _matchKey: (ev.title || ev.short_title || '').toLowerCase().trim(),
    };
  });
}

async function fetchTicketmasterEvents() {
  const apiKey = getKey('TICKETMASTER_API_KEY');
  if (!apiKey) return [];
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?stateCode=AZ&classificationName=music&size=50&sort=date,asc&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const events = (data._embedded && data._embedded.events) || [];
  return events.map(ev => {
    const venue = (ev._embedded && ev._embedded.venues && ev._embedded.venues[0]) || {};
    const priceRanges = ev.priceRanges || [];
    const minPrice = priceRanges.length > 0 ? priceRanges[0].min : null;
    return {
      name: ev.name,
      date: (ev.dates && ev.dates.start && ev.dates.start.localDate) || '',
      venue: venue.name || 'Unknown',
      city: venue.city ? venue.city.name : 'Unknown',
      ticketmasterPrice: minPrice,
      saleStatus: (ev.dates && ev.dates.status && ev.dates.status.code) || 'onsale',
      _matchKey: (ev.name || '').toLowerCase().trim(),
    };
  });
}

function mergeEvents(sgEvents, tmEvents) {
  const merged = [...sgEvents];
  for (const tmEv of tmEvents) {
    const existing = merged.find(m =>
      m.date === tmEv.date &&
      (m._matchKey === tmEv._matchKey ||
       m._matchKey.includes(tmEv._matchKey) ||
       tmEv._matchKey.includes(m._matchKey))
    );
    if (existing) {
      existing.ticketmasterPrice = tmEv.ticketmasterPrice;
      if (tmEv.saleStatus) existing.saleStatus = tmEv.saleStatus;
      if (!existing.sources.includes('ticketmaster')) existing.sources.push('ticketmaster');
    } else {
      const capacity = null;
      const demandScore = 50;
      merged.push({
        id: `tm_${tmEv.name}_${tmEv.date}`.replace(/\s+/g, '_'),
        name: tmEv.name,
        date: tmEv.date,
        venue: tmEv.venue,
        city: tmEv.city,
        venueCapacity: capacity,
        venueSize: 'Unknown',
        seatgeekPrice: null,
        seatgeekAvgPrice: null,
        listingCount: 0,
        ticketmasterPrice: tmEv.ticketmasterPrice,
        saleStatus: tmEv.saleStatus,
        supplyRatio: null,
        selloutLikelihood: 'Unknown',
        demandScore,
        seatgeekScore: null,
        seatgeekEventId: null,
        sources: ['ticketmaster'],
        _matchKey: tmEv._matchKey,
      });
    }
  }
  // Remove internal match key before returning
  return merged.map(({ _matchKey, ...rest }) => rest);
}

// GET /api/arizona/events — fetch all upcoming AZ events
router.get('/events', async (req, res) => {
  try {
    const [sgResult, tmResult] = await Promise.allSettled([
      fetchSeatGeekEvents(),
      fetchTicketmasterEvents(),
    ]);
    const sgEvents = sgResult.status === 'fulfilled' ? sgResult.value : [];
    const tmEvents = tmResult.status === 'fulfilled' ? tmResult.value : [];
    const events = mergeEvents(sgEvents, tmEvents);
    res.json({ events, count: events.length });
  } catch (err) {
    console.error('[Arizona] Events error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/arizona/velocity — get velocity data for tracked events
router.get('/velocity', (req, res) => {
  try {
    const tracker = loadTracker();
    const velocityData = {};
    for (const [key, event] of Object.entries(tracker.events || {})) {
      const metrics = calculateVelocity(event.snapshots || []);
      velocityData[key] = {
        name: event.name,
        venue: event.venue,
        date: event.date,
        venueCapacity: event.venueCapacity,
        ...metrics,
        snapshots: event.snapshots || [],
      };
    }
    res.json({ lastScan: tracker.lastScan, velocity: velocityData });
  } catch (err) {
    console.error('[Arizona] Velocity error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/arizona/scan — trigger a manual scan
router.post('/scan', async (req, res) => {
  try {
    const [sgResult, tmResult] = await Promise.allSettled([
      fetchSeatGeekEvents(),
      fetchTicketmasterEvents(),
    ]);
    const sgEvents = sgResult.status === 'fulfilled' ? sgResult.value : [];
    const tmEvents = tmResult.status === 'fulfilled' ? tmResult.value : [];
    const events = mergeEvents(sgEvents, tmEvents);

    const tracker = loadTracker();
    const now = new Date().toISOString();
    tracker.lastScan = now;

    for (const event of events) {
      const key = makeEventKey(event.name, event.venue, event.date);
      if (!tracker.events[key]) {
        tracker.events[key] = {
          name: event.name,
          venue: event.venue,
          date: event.date,
          venueCapacity: event.venueCapacity,
          snapshots: [],
        };
      }
      tracker.events[key].venueCapacity = event.venueCapacity || tracker.events[key].venueCapacity;
      tracker.events[key].snapshots.push({
        timestamp: now,
        listingCount: event.listingCount || 0,
        floorPrice: event.seatgeekPrice || event.ticketmasterPrice || null,
        avgPrice: event.seatgeekAvgPrice || null,
      });
    }

    saveTracker(tracker);
    res.json({ success: true, scanned: events.length, lastScan: now });
  } catch (err) {
    console.error('[Arizona] Scan error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
