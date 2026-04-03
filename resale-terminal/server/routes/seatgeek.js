import { Router } from 'express';
import { getKey } from '../lib/getKey.js';

const router = Router();

// GET /api/seatgeek/events — search events via SeatGeek API
router.get('/events', async (req, res) => {
  try {
    const clientId = getKey('SEATGEEK_CLIENT_ID');
    if (!clientId) {
      return res.json({ events: [] });
    }

    const { q, per_page = 20, id, page } = req.query;
    const params = new URLSearchParams({ client_id: clientId, per_page: String(per_page) });

    if (q) params.set('q', q);
    if (id) params.set('id', id);
    if (page) params.set('page', String(page));

    const url = `https://api.seatgeek.com/2/events?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`SeatGeek events API error: ${response.status} ${response.statusText}`);
      return res.json({ events: [] });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('SeatGeek events route error:', err.message);
    res.json({ events: [] });
  }
});

// GET /api/seatgeek/event/:id — fetch a single event by ID with full details
router.get('/event/:id', async (req, res) => {
  try {
    const clientId = getKey('SEATGEEK_CLIENT_ID');
    if (!clientId) {
      return res.status(500).json({ error: 'SEATGEEK_CLIENT_ID not configured' });
    }

    const { id } = req.params;
    const url = `https://api.seatgeek.com/2/events/${id}?client_id=${clientId}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({ error: `SeatGeek API error: ${response.statusText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/seatgeek/venue/:id — fetch venue details including capacity
router.get('/venue/:id', async (req, res) => {
  try {
    const clientId = getKey('SEATGEEK_CLIENT_ID');
    if (!clientId) {
      return res.status(500).json({ error: 'SEATGEEK_CLIENT_ID not configured' });
    }

    const { id } = req.params;
    const url = `https://api.seatgeek.com/2/venues/${id}?client_id=${clientId}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({ error: `SeatGeek venue API error: ${response.statusText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
