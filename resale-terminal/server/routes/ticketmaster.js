import { Router } from 'express';

const router = Router();

// GET /api/ticketmaster/events — proxy to Ticketmaster Discovery API
router.get('/events', async (req, res) => {
  try {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'TICKETMASTER_API_KEY not configured' });
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
      const text = await response.text();
      return res.status(response.status).json({ error: 'Ticketmaster API error', details: text });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Ticketmaster proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch from Ticketmaster' });
  }
});

export default router;
