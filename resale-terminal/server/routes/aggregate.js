import { Router } from 'express';
import { getKey } from '../lib/getKey.js';
import { classifyVenue, computeSupply, computeSpread, generateSignal } from '../lib/ticketIntel.js';

const router = Router();

router.get('/event', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Missing ?q= search parameter' });

  try {
    const sgKey = getKey('SEATGEEK_CLIENT_ID');
    const tmKey = getKey('TICKETMASTER_API_KEY');

    const [sgResult, tmResult] = await Promise.allSettled([
      sgKey
        ? fetch(`https://api.seatgeek.com/2/events?q=${encodeURIComponent(q)}&client_id=${sgKey}&per_page=5`).then(r => r.json())
        : Promise.reject(new Error('No SeatGeek key')),
      tmKey
        ? fetch(`https://app.ticketmaster.com/discovery/v2/events.json?keyword=${encodeURIComponent(q)}&apikey=${tmKey}&size=5&countryCode=US`).then(r => r.json())
        : Promise.reject(new Error('No Ticketmaster key')),
    ]);

    const sgEvent = sgResult.status === 'fulfilled' ? (sgResult.value.events || [])[0] : null;
    const tmEvent = tmResult.status === 'fulfilled' ? (tmResult.value._embedded?.events || [])[0] : null;

    if (!sgEvent && !tmEvent) {
      return res.status(404).json({ error: 'No events found on either platform' });
    }

    // Extract SeatGeek data
    const sgStats = sgEvent?.stats || {};
    const sgVenue = sgEvent?.venue || {};
    const sgScore = sgEvent?.score || 0;
    const sgPopularity = sgEvent?.popularity || 0;

    // Extract Ticketmaster data
    const tmPriceRange = tmEvent?.priceRanges?.[0] || {};
    const tmVenue = tmEvent?._embedded?.venues?.[0] || {};
    const tmStatus = tmEvent?.dates?.status?.code || null;

    // Unified fields
    const eventName = sgEvent?.title || tmEvent?.name || q;
    const eventDate = sgEvent?.datetime_local || tmEvent?.dates?.start?.localDate || null;
    const venueName = sgVenue.name || tmVenue.name || null;
    const venueCity = sgVenue.city || tmVenue.city?.name || null;
    const venueState = sgVenue.state || tmVenue.state?.stateCode || null;
    const venueCapacity = sgVenue.capacity || null;

    // Compute intelligence
    const venueClass = classifyVenue(venueCapacity);
    const listingCount = sgStats.listing_count || 0;
    const supply = computeSupply(listingCount, venueCapacity, sgPopularity);
    const spread = computeSpread(sgStats.lowest_price, tmPriceRange.min);
    const signal = generateSignal(supply, { score: sgScore * 100 }, spread);

    const response = {
      event: {
        name: eventName,
        date: eventDate,
        venue: venueName,
        city: venueCity,
        state: venueState,
      },
      venue: {
        name: venueName,
        capacity: venueCapacity,
        size: venueClass.size,
      },
      pricing: {
        seatgeek: {
          floor: sgStats.lowest_price || null,
          avg: sgStats.average_price || null,
          high: sgStats.highest_price || null,
          listingCount: sgStats.listing_count || 0,
        },
        ticketmaster: {
          faceMin: tmPriceRange.min || null,
          faceMax: tmPriceRange.max || null,
          status: tmStatus,
        },
      },
      supply: {
        totalEstimatedListings: listingCount,
        seatgeekListings: sgStats.listing_count || 0,
        venueCapacity: venueCapacity,
        supplyRatio: supply.supplyRatio,
        supplyLevel: supply.supplyLevel,
        selloutLikelihood: supply.selloutLikelihood,
      },
      demand: {
        score: sgScore,
        popularity: sgPopularity,
      },
      spread,
      signal,
    };

    res.json(response);
  } catch (err) {
    console.error('[aggregate] Error:', err.message);
    res.status(500).json({ error: 'Aggregation failed', details: err.message });
  }
});

export default router;
