import { Router } from 'express';
import { getKey } from '../lib/getKey.js';

const router = Router();

// GET /api/ticketmaster/events — proxy to Ticketmaster Discovery API
router.get('/events', async (req, res) => {
  try {
    const apiKey = getKey('TICKETMASTER_API_KEY');
    if (!apiKey) {
      return res.json({ _embedded: { events: [] } });
    }

    const { keyword, size = 20 } = req.query;
    const params = new URLSearchParams({
      apikey: apiKey,
      size: String(size),
      countryCode: 'US',
    });

    if (keyword) params.set('keyword', keyword);

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      // Return empty results instead of crashing the frontend
      console.error(`Ticketmaster API error: ${response.status} ${response.statusText}`);
      return res.json({ _embedded: { events: [] } });
    }

    const data = await response.json();

    // Ensure _embedded.events exists to prevent frontend crashes
    if (!data._embedded || !data._embedded.events) {
      return res.json({ _embedded: { events: [] } });
    }

    res.json(data);
  } catch (err) {
    console.error('Ticketmaster route error:', err.message);
    // Return empty results instead of 500 to prevent frontend crashes
    res.json({ _embedded: { events: [] } });
  }
});

export default router;
