import { Router } from 'express';
import { getKey } from '../lib/getKey.js';

const router = Router();

// GET /api/ticketmaster/events — search events via Ticketmaster Discovery API
router.get('/events', async (req, res) => {
  try {
    const apiKey = getKey('TICKETMASTER_API_KEY');
    if (!apiKey) {
      return res.json({ _embedded: { events: [] } });
    }

    const { keyword, size = 20, page, sort, countryCode = 'US' } = req.query;
    const params = new URLSearchParams({
      apikey: apiKey,
      size: String(size),
      countryCode,
    });

    if (keyword) params.set('keyword', keyword);
    if (page) params.set('page', String(page));
    if (sort) params.set('sort', sort);

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
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
    console.error('Ticketmaster events route error:', err.message);
    res.json({ _embedded: { events: [] } });
  }
});

// GET /api/ticketmaster/venue/:id — fetch venue details including capacity
router.get('/venue/:id', async (req, res) => {
  try {
    const apiKey = getKey('TICKETMASTER_API_KEY');
    if (!apiKey) {
      return res.status(500).json({ error: 'TICKETMASTER_API_KEY not configured' });
    }

    const { id } = req.params;
    const url = `https://app.ticketmaster.com/discovery/v2/venues/${id}.json?apikey=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({ error: `Ticketmaster venue API error: ${response.statusText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
