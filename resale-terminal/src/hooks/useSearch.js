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

function mergeResults(seatgeekData, ticketmasterData) {
  const events = [];

  const sgEvents = seatgeekData?.events || seatgeekData || [];
  const tmEvents = ticketmasterData?.events || ticketmasterData?._embedded?.events || [];

  // Build a map of Ticketmaster events by name (lowercase) for matching
  const tmMap = new Map();
  for (const tm of tmEvents) {
    const name = (tm.name || '').toLowerCase();
    const price = tm.priceRanges?.[0]?.min || null;
    tmMap.set(name, { price, venue: tm._embedded?.venues?.[0]?.name || '' });
  }

  for (const sg of sgEvents) {
    const name = sg.title || sg.short_title || '';
    const sgPrice = sg.stats?.lowest_price || null;
    const sgScore = sg.score || 0;
    const venue = sg.venue?.name || '';
    const date = sg.datetime_local || sg.datetime_utc || '';
    const seatgeekEventId = sg.id;

    // Try to find matching TM event
    const tmMatch = tmMap.get(name.toLowerCase());
    const tmPrice = tmMatch?.price || null;

    const demandScore = computeDemandScore(sgScore, sgPrice, tmPrice);

    events.push({
      id: seatgeekEventId || `sg-${events.length}`,
      name,
      date,
      venue: venue || tmMatch?.venue || '',
      seatgeekPrice: sgPrice,
      ticketmasterPrice: tmPrice,
      seatgeekScore: sgScore,
      demandScore,
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
      events.push({
        id: tm.id || `tm-${events.length}`,
        name,
        date: tm.dates?.start?.localDate || '',
        venue: tm._embedded?.venues?.[0]?.name || '',
        seatgeekPrice: null,
        ticketmasterPrice: tmPrice,
        seatgeekScore: 0,
        demandScore: 10,
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
    } catch (err) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { query, setQuery, results, loading, error, search };
}
