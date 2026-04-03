import { getKey } from './getKey.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const TRACKER_FILE = join(DATA_DIR, 'arizona_tracker.json');

let scanInterval = null;

function loadTracker() {
  if (existsSync(TRACKER_FILE)) {
    return JSON.parse(readFileSync(TRACKER_FILE, 'utf-8'));
  }
  return { lastScan: null, events: {} };
}

function saveTracker(data) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(TRACKER_FILE, JSON.stringify(data, null, 2));
}

function makeEventKey(name, venue, date) {
  const n = (name || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const v = (venue || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const d = (date || '').slice(0, 10);
  return `${n}::${v}::${d}`;
}

/**
 * Run a single scan — fetch all AZ events and save snapshots
 */
export async function runArizonaScan() {
  const clientId = getKey('SEATGEEK_CLIENT_ID');
  if (!clientId) {
    console.log('[AutoScanner] No SeatGeek API key configured, skipping scan');
    return { scanned: 0 };
  }

  console.log(`[AutoScanner] Starting Arizona scan at ${new Date().toISOString()}`);

  // Fetch events from SeatGeek (AZ concerts)
  let sgEvents = [];
  try {
    const url = `https://api.seatgeek.com/2/events?venue.state=AZ&type=concert&per_page=50&sort=datetime_utc.asc&client_id=${clientId}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      sgEvents = (data.events || []).map(ev => {
        const venue = ev.venue || {};
        const stats = ev.stats || {};
        return {
          name: ev.title || ev.short_title,
          venue: venue.name || 'Unknown',
          date: (ev.datetime_utc || '').slice(0, 10),
          venueCapacity: venue.capacity || null,
          listingCount: stats.listing_count || 0,
          floorPrice: stats.lowest_price || null,
          avgPrice: stats.average_price || null,
        };
      });
    } else {
      console.error(`[AutoScanner] SeatGeek error: ${response.status}`);
    }
  } catch (err) {
    console.error(`[AutoScanner] SeatGeek fetch error: ${err.message}`);
  }

  // Also try Ticketmaster
  let tmEvents = [];
  try {
    const tmKey = getKey('TICKETMASTER_API_KEY');
    if (tmKey) {
      const tmUrl = `https://app.ticketmaster.com/discovery/v2/events.json?stateCode=AZ&classificationName=music&size=50&sort=date,asc&apikey=${tmKey}`;
      const tmRes = await fetch(tmUrl);
      if (tmRes.ok) {
        const tmData = await tmRes.json();
        const tmRaw = (tmData._embedded && tmData._embedded.events) || [];
        tmEvents = tmRaw.map(ev => {
          const venue = (ev._embedded && ev._embedded.venues && ev._embedded.venues[0]) || {};
          const priceRanges = ev.priceRanges || [];
          const minPrice = priceRanges.length > 0 ? priceRanges[0].min : null;
          return {
            name: ev.name,
            venue: venue.name || 'Unknown',
            date: (ev.dates && ev.dates.start && ev.dates.start.localDate) || '',
            venueCapacity: null,
            listingCount: 0,
            floorPrice: minPrice,
            avgPrice: null,
          };
        });
      }
    }
  } catch (err) {
    console.error(`[AutoScanner] Ticketmaster fetch error: ${err.message}`);
  }

  // Merge: prefer SeatGeek data, add TM-only events
  const allEvents = [...sgEvents];
  for (const tmEv of tmEvents) {
    const tmKey = (tmEv.name || '').toLowerCase().trim();
    const exists = allEvents.find(sg => {
      const sgKey = (sg.name || '').toLowerCase().trim();
      return sg.date === tmEv.date && (sgKey === tmKey || sgKey.includes(tmKey) || tmKey.includes(sgKey));
    });
    if (!exists) {
      allEvents.push(tmEv);
    }
  }

  // Load existing tracker data and add snapshots
  const tracker = loadTracker();
  const now = new Date().toISOString();
  tracker.lastScan = now;

  for (const event of allEvents) {
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
    // Update capacity if we got new info
    if (event.venueCapacity) {
      tracker.events[key].venueCapacity = event.venueCapacity;
    }
    tracker.events[key].snapshots.push({
      timestamp: now,
      listingCount: event.listingCount || 0,
      floorPrice: event.floorPrice || null,
      avgPrice: event.avgPrice || null,
    });
  }

  saveTracker(tracker);
  console.log(`[AutoScanner] Scanned ${allEvents.length} Arizona events`);
  return { scanned: allEvents.length };
}

/**
 * Start the auto-scanner on an interval
 * Default: every 6 hours (4 scans per day to stay within API rate limits)
 */
export function startAutoScanner(intervalMs = 6 * 60 * 60 * 1000) {
  if (scanInterval) {
    clearInterval(scanInterval);
  }

  // Run immediately on start
  runArizonaScan().catch(err => console.error('[AutoScanner] Error:', err.message));

  // Then run on interval
  scanInterval = setInterval(() => {
    runArizonaScan().catch(err => console.error('[AutoScanner] Error:', err.message));
  }, intervalMs);

  console.log(`[AutoScanner] Started. Scanning every ${intervalMs / 1000 / 60} minutes`);
}

export function stopAutoScanner() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
    console.log('[AutoScanner] Stopped');
  }
}
