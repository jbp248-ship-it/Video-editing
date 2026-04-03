import { Router } from 'express';
import { getKey } from '../lib/getKey.js';

const router = Router();

// GET /api/supply/analysis — aggregate supply data from SeatGeek and compute metrics
router.get('/analysis', async (req, res) => {
  try {
    const clientId = getKey('SEATGEEK_CLIENT_ID');
    if (!clientId) {
      return res.status(500).json({ error: 'SEATGEEK_CLIENT_ID not configured' });
    }

    const { q, seatgeek_event_id } = req.query;
    if (!q && !seatgeek_event_id) {
      return res.status(400).json({ error: 'q (search query) or seatgeek_event_id is required' });
    }

    let event = null;

    if (seatgeek_event_id) {
      // Fetch specific event by ID
      const eventUrl = `https://api.seatgeek.com/2/events/${seatgeek_event_id}?client_id=${clientId}`;
      const eventRes = await fetch(eventUrl);
      if (eventRes.ok) {
        event = await eventRes.json();
      }
    }

    if (!event && q) {
      // Search for events and use the top result
      const searchUrl = `https://api.seatgeek.com/2/events?q=${encodeURIComponent(q)}&client_id=${clientId}&per_page=1`;
      const searchRes = await fetch(searchUrl);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.events && searchData.events.length > 0) {
          event = searchData.events[0];
        }
      }
    }

    if (!event) {
      return res.status(404).json({ error: 'No events found matching query' });
    }

    // Extract SeatGeek stats
    const stats = event.stats || {};
    const venueData = event.venue || {};
    let venueCapacity = venueData.capacity || null;

    // If venue capacity not in event data, try fetching venue directly
    if (!venueCapacity && venueData.id) {
      try {
        const venueUrl = `https://api.seatgeek.com/2/venues/${venueData.id}?client_id=${clientId}`;
        const venueRes = await fetch(venueUrl);
        if (venueRes.ok) {
          const fullVenue = await venueRes.json();
          venueCapacity = fullVenue.capacity || null;
        }
      } catch (venueErr) {
        console.error('Failed to fetch venue details:', venueErr.message);
      }
    }

    const listingCount = stats.listing_count || stats.visible_listing_count || 0;
    const lowestPrice = stats.lowest_price || null;
    const avgPrice = stats.average_price || null;
    const highestPrice = stats.highest_price || null;
    const eventPopularity = event.score || event.popularity || 0;

    // Compute supply metrics
    let supplyRatio = null;
    let supplyLevel = 'Unknown';
    let selloutLikelihood = 'Unknown';
    let estimatedUnsold = null;

    if (venueCapacity && venueCapacity > 0) {
      supplyRatio = parseFloat(((listingCount / venueCapacity) * 100).toFixed(2));

      if (supplyRatio < 2) {
        supplyLevel = 'Low';
      } else if (supplyRatio < 5) {
        supplyLevel = 'Medium';
      } else {
        supplyLevel = 'High';
      }

      // Rough estimate of unsold tickets based on supply ratio and popularity
      // Higher popularity = more primary tickets sold, so fewer unsold
      const popularityFactor = Math.max(0.1, 1 - (eventPopularity || 0));
      estimatedUnsold = Math.round(venueCapacity * popularityFactor * 0.3);

      // Sellout likelihood based on supply ratio + popularity
      if (supplyRatio < 2 && eventPopularity > 0.7) {
        selloutLikelihood = 'Very High';
      } else if (supplyRatio < 3 && eventPopularity > 0.5) {
        selloutLikelihood = 'High';
      } else if (supplyRatio < 5) {
        selloutLikelihood = 'Medium';
      } else {
        selloutLikelihood = 'Low';
      }
    }

    const result = {
      event: {
        id: event.id,
        title: event.title || event.short_title,
        date: event.datetime_local || event.datetime_utc,
        score: event.score,
        popularity: event.popularity,
      },
      seatgeek: {
        listingCount,
        lowestPrice,
        avgPrice,
        highestPrice,
      },
      venue: {
        name: venueData.name || 'Unknown',
        capacity: venueCapacity,
        city: venueData.city || null,
        state: venueData.state || null,
      },
      supplyMetrics: {
        totalListings: listingCount,
        venueCapacity: venueCapacity,
        supplyRatio: supplyRatio,
        supplyLevel: supplyLevel,
        estimatedUnsold: estimatedUnsold,
        selloutLikelihood: selloutLikelihood,
      },
    };

    res.json(result);
  } catch (err) {
    console.error('Supply analysis error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
