import { Router } from 'express';

const router = Router();

// POST /api/ai/recommend — get AI-powered ticket recommendation
router.post('/recommend', async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    // Accept both camelCase and snake_case field names
    const eventName = req.body.eventName || req.body.event_name;
    const seatgeekPrice = req.body.seatgeekPrice ?? req.body.seatgeek_price;
    const ticketmasterPrice = req.body.ticketmasterPrice ?? req.body.ticketmaster_price;
    const demandScore = req.body.demandScore ?? req.body.demand_score;
    const seatgeekScore = req.body.seatgeekScore ?? req.body.seatgeek_score;
    const eventDate = req.body.eventDate || req.body.event_date;

    if (!eventName) {
      return res.status(400).json({ error: 'eventName is required' });
    }

    // Calculate spread if both prices exist
    const spread = seatgeekPrice && ticketmasterPrice && ticketmasterPrice > 0
      ? (((seatgeekPrice - ticketmasterPrice) / ticketmasterPrice) * 100).toFixed(1)
      : 'N/A';

    const userMessage = `Event: ${eventName}
SeatGeek Floor Price: $${seatgeekPrice || 'N/A'}
Ticketmaster Face Value: $${ticketmasterPrice || 'N/A'}
Demand Score: ${demandScore || 'N/A'}/100
SeatGeek Popularity: ${seatgeekScore || 'N/A'}
Event Date: ${eventDate || 'N/A'}
Price Spread: ${spread}%`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: 'You are a professional ticket resale analyst. Analyze the following market data and provide a recommendation. Respond ONLY with valid JSON: { "recommendation": "Buy"|"Wait"|"Avoid", "confidence": 0-100, "reasoning": "brief explanation" }',
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({ error: `Anthropic API error: ${response.statusText}`, details: errorBody });
    }

    const data = await response.json();

    // Extract text content from Anthropic response
    const textContent = data.content?.find((block) => block.type === 'text');
    if (!textContent) {
      return res.status(500).json({ error: 'No text content in AI response' });
    }

    // Parse the JSON from the AI response
    const recommendation = JSON.parse(textContent.text);
    res.json(recommendation);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: 'Failed to parse AI response as JSON' });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
