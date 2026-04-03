import { Router } from 'express';

const router = Router();

// POST /api/ai/recommend — get AI-powered ticket resale investment analysis
router.post('/recommend', async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    // Accept both camelCase and snake_case field names
    const eventName = req.body.eventName || req.body.event_name;
    const venue = req.body.venue || req.body.venue_name || '';
    const eventDate = req.body.eventDate || req.body.event_date;
    const seatgeekPrice = req.body.seatgeekPrice ?? req.body.seatgeek_price;
    const seatgeekAvgPrice = req.body.seatgeekAvgPrice ?? req.body.seatgeek_avg_price;
    const seatgeekHighPrice = req.body.seatgeekHighPrice ?? req.body.seatgeek_high_price;
    const ticketmasterPrice = req.body.ticketmasterPrice ?? req.body.ticketmaster_price;
    const ticketmasterMaxPrice = req.body.ticketmasterMaxPrice ?? req.body.ticketmaster_max_price;
    const listingCount = req.body.listingCount ?? req.body.listing_count;
    const seatgeekScore = req.body.seatgeekScore ?? req.body.seatgeek_score;
    const popularity = req.body.popularity ?? req.body.popularity;
    const demandScore = req.body.demandScore ?? req.body.demand_score;

    if (!eventName) {
      return res.status(400).json({ error: 'eventName is required' });
    }

    // Calculate days until event
    let daysUntilEvent = 'Unknown';
    if (eventDate) {
      const eventDateObj = new Date(eventDate);
      const now = new Date();
      const diffMs = eventDateObj - now;
      daysUntilEvent = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Calculate spread if both prices exist
    const spread = seatgeekPrice && ticketmasterPrice && ticketmasterPrice > 0
      ? (((seatgeekPrice - ticketmasterPrice) / ticketmasterPrice) * 100).toFixed(1)
      : 'N/A';

    const userMessage = `Analyze this event as a RESALE INVESTMENT opportunity:

Event: ${eventName}
Venue: ${venue || 'N/A'}
Event Date: ${eventDate || 'N/A'}
Days Until Event: ${daysUntilEvent}

RESALE MARKET DATA (SeatGeek):
- Floor Price (Lowest): $${seatgeekPrice || 'N/A'}
- Average Price: $${seatgeekAvgPrice || 'N/A'}
- Highest Price: $${seatgeekHighPrice || 'N/A'}
- Active Listings: ${listingCount || 'N/A'}
- Popularity Score: ${seatgeekScore || 'N/A'} (0-1 scale)
- Raw Popularity: ${popularity || 'N/A'}

PRIMARY MARKET DATA (Ticketmaster):
- Face Value (Min): $${ticketmasterPrice || 'N/A'}
- Face Value (Max): $${ticketmasterMaxPrice || 'N/A'}

COMPUTED:
- Resale vs Face Spread: ${spread}%
- Demand Score: ${demandScore || 'N/A'}/100`;

    const systemPrompt = `You are a professional ticket resale investment analyst at a hedge fund that trades event tickets. You provide precise, data-driven analysis of ticket resale opportunities.

Your analysis framework:
1. SUPPLY ANALYSIS: Evaluate listing count relative to typical venue sizes. Under 50 listings = constrained supply. 50-200 = moderate. Over 200 = saturated.
2. DEMAND SIGNALS: Use popularity score, price spreads, and proximity to event date. High popularity + low supply = strong demand.
3. VELOCITY ESTIMATION: Based on listing count and days until event. Few listings close to event date = tickets already sold (fast velocity). Many listings close to event = slow velocity (bearish).
4. PRICE SPREAD: If resale floor > face value, there's margin for profit. If resale < face, the market is pricing the event below expectation (bearish).
5. RISK FACTORS: Event cancellation risk, oversupply risk, price compression near event date.

You MUST respond with ONLY valid JSON in this exact format (no markdown, no code fences):
{
  "recommendation": "Buy" or "Wait" or "Avoid",
  "confidence": <number 0-100>,
  "reasoning": "<2-3 sentence investment thesis explaining the supply/demand dynamics and why you recommend this action>",
  "metrics": {
    "supplyLevel": "Low" or "Medium" or "High",
    "velocityEstimate": "Fast" or "Moderate" or "Slow",
    "riskLevel": "Low" or "Medium" or "High"
  }
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
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

    // Parse the JSON from the AI response, stripping any markdown fences
    let jsonText = textContent.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const recommendation = JSON.parse(jsonText);

    // Ensure the response has the expected shape
    const result = {
      recommendation: recommendation.recommendation || 'Wait',
      confidence: recommendation.confidence ?? 50,
      reasoning: recommendation.reasoning || 'Analysis unavailable.',
      metrics: {
        supplyLevel: recommendation.metrics?.supplyLevel || 'Medium',
        velocityEstimate: recommendation.metrics?.velocityEstimate || 'Moderate',
        riskLevel: recommendation.metrics?.riskLevel || 'Medium',
      },
    };

    res.json(result);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: 'Failed to parse AI response as JSON' });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
