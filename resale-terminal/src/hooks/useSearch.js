import { useState, useCallback } from 'react';
import { api } from '../lib/api';

function computeDemandScore(seatgeekScore, seatgeekPrice, ticketmasterPrice) {
  // Popularity component (0-40): based on SeatGeek score (0-1)
  const popularity = (seatgeekScore || 0) * 40;

  // Spread ratio component (0-40): how much resale exceeds face value
  let spreadRatio = 0;
  if (ticketmasterPrice && ticketmasterPrice > 0 && seatgeekPrice) {
    const ratio = seatgeekPrice / ticketmasterPrice;
    spreadRatio = Math.min(ratio / 5, 1) * 40;
  }

  // Date proximity component (0-20): not computable without date context, default to 10
  const dateProximity = 10;

  return Math.round(popularity + spreadRatio + dateProximity);
}

function classifyVenueSize(capacity) {
  if (!capacity || capacity <= 0) return null;
  if (capacity < 1000) return 'Intimate';
  if (capacity <= 5000) return 'Small';
  if (capacity <= 15000) return 'Medium';
  if (capacity <= 30000) return 'Large';
  return 'Arena';
}

function computeSelloutLikelihood(supplyRatio, seatgeekScore) {
  if (supplyRatio == null || seatgeekScore == null) return null;
  const ratio = parseFloat(supplyRatio);
  // Low supply + high demand = likely sellout
  if (ratio < 2 && seatgeekScore > 0.7) return 'Likely';
  if (ratio < 3 && seatgeekScore > 0.5) return 'Possible';
  if (ratio < 5 || seatgeekScore > 0.6) return 'Possible';
  return 'Unlikely';
}

function mergeResults(seatgeekData, ticketmasterData) {
  const events = [];

  const sgEvents = seatgeekData?.events || seatgeekData || [];
  const tmEvents = ticketmasterData?.events || ticketmasterData?._embedded?.events || [];

  // Build a map of Ticketmaster events by name (lowercase) for matching
  const tmMap = new Map();
  for (const tm of tmEvents) {
    const name = (tm.name || '').toLowerCase();
    const price = tm.priceRanges?.[0]?.min || null;
    const maxPrice = tm.priceRanges?.[0]?.max || null;
    const venue = tm._embedded?.venues?.[0]?.name || '';
    const tmVenueId = tm._embedded?.venues?.[0]?.id || null;
    const status = tm.dates?.status?.code || null;
    tmMap.set(name, { price, maxPrice, venue, tmVenueId, status });
  }

  for (const sg of sgEvents) {
    const name = sg.title || sg.short_title || '';
    const sgPrice = sg.stats?.lowest_price || null;
    const sgAvgPrice = sg.stats?.average_price || null;
    const sgHighPrice = sg.stats?.highest_price || null;
    const sgListingCount = sg.stats?.listing_count || null;
    const sgVisibleListings = sg.stats?.visible_listing_count || null;
    const sgScore = sg.score || 0;
    const sgPopularity = sg.popularity || 0;
    const venue = sg.venue?.name || '';
    const venueId = sg.venue?.id || null;
    const venueCapacity = sg.venue?.capacity || null;
    const city = sg.venue?.city || '';
    const state = sg.venue?.state || '';
    const date = sg.datetime_local || sg.datetime_utc || '';
    const seatgeekEventId = sg.id;

    // Try to find matching TM event
    const tmMatch = tmMap.get(name.toLowerCase());
    const tmPrice = tmMatch?.price || null;
    const tmMaxPrice = tmMatch?.maxPrice || null;
    const tmVenueId = tmMatch?.tmVenueId || null;
    const saleStatus = tmMatch?.status || null;

    const demandScore = computeDemandScore(sgScore, sgPrice, tmPrice);

    // Compute supply ratio and venue classification
    const supplyRatio = (venueCapacity > 0 && sgListingCount > 0)
      ? (sgListingCount / venueCapacity * 100).toFixed(1)
      : null;
    const venueSize = classifyVenueSize(venueCapacity);
    const selloutLikelihood = computeSelloutLikelihood(supplyRatio, sgScore);

    events.push({
      id: seatgeekEventId || `sg-${events.length}`,
      name,
      date,
      venue: venue || tmMatch?.venue || '',
      venueId,
      venueCapacity,
      venueSize,
      city,
      state,
      seatgeekPrice: sgPrice,
      seatgeekAvgPrice: sgAvgPrice,
      seatgeekHighPrice: sgHighPrice,
      ticketmasterPrice: tmPrice,
      ticketmasterMaxPrice: tmMaxPrice,
      listingCount: sgListingCount,
      visibleListings: sgVisibleListings,
      supplyRatio,
      seatgeekScore: sgScore,
      popularity: sgPopularity,
      demandScore,
      selloutLikelihood,
      saleStatus,
      tmVenueId,
      seatgeekEventId,
    });
  }

  // Add TM events that weren't matched
  for (const tm of tmEvents) {
    const name = tm.name || '';
    const alreadyAdded = events.some(
      (e) => e.name.toLowerCase() === name.toLowerCase()
    );
    if (!alreadyAdded) {
      const tmPrice = tm.priceRanges?.[0]?.min || null;
      const tmMaxPrice = tm.priceRanges?.[0]?.max || null;
      const tmVenue = tm._embedded?.venues?.[0]?.name || '';
      const tmVenueId = tm._embedded?.venues?.[0]?.id || null;
      const saleStatus = tm.dates?.status?.code || null;
      events.push({
        id: tm.id || `tm-${events.length}`,
        name,
        date: tm.dates?.start?.localDate || '',
        venue: tmVenue,
        venueId: null,
        venueCapacity: null,
        venueSize: null,
        city: '',
        state: '',
        seatgeekPrice: null,
        seatgeekAvgPrice: null,
        seatgeekHighPrice: null,
        ticketmasterPrice: tmPrice,
        ticketmasterMaxPrice: tmMaxPrice,
        listingCount: null,
        visibleListings: null,
        supplyRatio: null,
        seatgeekScore: 0,
        popularity: 0,
        demandScore: 10,
        selloutLikelihood: null,
        saleStatus,
        tmVenueId,
        seatgeekEventId: null,
      });
    }
  }

  return events;
}

export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = useCallback(async (term) => {
    if (!term || !term.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    setQuery(term);

    try {
      const [seatgeekData, ticketmasterData] = await Promise.allSettled([
        api.searchSeatGeek(term),
        api.searchTicketmaster(term),
      ]);

      const sgResult = seatgeekData.status === 'fulfilled' ? seatgeekData.value : [];
      const tmResult = ticketmasterData.status === 'fulfilled' ? ticketmasterData.value : [];

      const merged = mergeResults(sgResult, tmResult);
      setResults(merged);

      // Save price snapshots in the background for trend tracking
      for (const evt of merged) {
        if (evt.seatgeekPrice || evt.listingCount) {
          const eventKey = `${evt.name}::${evt.venue}`;
          api.savePriceSnapshot({
            eventKey,
            seatgeekFloor: evt.seatgeekPrice,
            seatgeekAvg: evt.seatgeekAvgPrice,
            seatgeekHigh: evt.seatgeekHighPrice,
            listingCount: evt.listingCount,
            demandScore: evt.demandScore,
          }).catch(() => {}); // fire-and-forget
        }
      }
    } catch (err) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { query, setQuery, results, loading, error, search };
}
