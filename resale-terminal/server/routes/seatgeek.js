import { Router } from 'express';

const router = Router();

// GET /api/seatgeek/events — proxy to SeatGeek API
router.get('/events', async (req, res) => {
  try {
    const clientId = process.env.SEATGEEK_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: 'SEATGEEK_CLIENT_ID not configured' });
    }

    const { q, per_page = 20, id } = req.query;
    const params = new URLSearchParams({
      client_id: clientId,
      per_page: String(per_page),
    });

    if (q) params.set('q', q);
    if (id) params.set('id', id);

    const url = `https://api.seatgeek.com/2/events?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'SeatGeek API error', details: text });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('SeatGeek proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch from SeatGeek' });
  }
});

export default router;
