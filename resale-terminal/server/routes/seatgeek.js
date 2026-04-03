import { Router } from 'express';

const router = Router();

// GET /api/seatgeek/events — proxy to SeatGeek API
router.get('/events', async (req, res) => {
  try {
    const clientId = process.env.SEATGEEK_CLIENT_ID;
    if (!clientId) {
      return res.json({ events: [] });
    }

    const { q, per_page = 20, id } = req.query;
    const params = new URLSearchParams({ client_id: clientId, per_page: String(per_page) });

    if (q) params.set('q', q);
    if (id) params.set('id', id);

    const url = `https://api.seatgeek.com/2/events?${params.toString()}`;
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

// GET /api/seatgeek/event/:id — fetch a single event by ID with full details
router.get('/event/:id', async (req, res) => {
  try {
    const clientId = process.env.SEATGEEK_CLIENT_ID;
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

export default router;
