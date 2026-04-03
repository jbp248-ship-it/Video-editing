import { Router } from 'express';

const router = Router();

// POST /api/ai/recommend — get AI-powered ticket recommendation
router.post('/recommend', async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const { eventName, seatgeekPrice, ticketmasterPrice, demandScore, spread } = req.body;

    if (!eventName) {
      return res.status(400).json({ error: 'eventName is required' });
    }

    const userMessage = `Event: ${eventName}
SeatGeek Price: $${seatgeekPrice || 'N/A'}
Ticketmaster Price: $${ticketmasterPrice || 'N/A'}
Demand Score: ${demandScore || 'N/A'}/100
Price Spread: ${spread || 'N/A'}%`;

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
