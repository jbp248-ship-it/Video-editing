import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';
import {
  MapPin, RefreshCw, TrendingUp, TrendingDown, Flame,
  Clock, Building2, Users, ArrowUpDown, Filter,
} from 'lucide-react';

const VENUE_SIZES = ['All', 'Intimate', 'Small', 'Medium', 'Large', 'Arena'];
const SORT_OPTIONS = [
  { value: 'date', label: 'Date' },
  { value: 'velocity', label: 'Velocity' },
  { value: 'price', label: 'Price (Low)' },
  { value: 'demand', label: 'Demand Score' },
];

const VELOCITY_STYLES = {
  'Very Fast': { bg: 'bg-red-900/40', text: 'text-red-400', label: 'Very Fast \u{1F525}' },
  'Fast': { bg: 'bg-emerald-900/40', text: 'text-emerald-400', label: 'Fast' },
  'Moderate': { bg: 'bg-amber-900/40', text: 'text-amber-400', label: 'Moderate' },
  'Slow': { bg: 'bg-slate-700/40', text: 'text-slate-400', label: 'Slow' },
  'Increasing': { bg: 'bg-red-900/40', text: 'text-red-400', label: 'Increasing \u26A0\uFE0F' },
  'Unknown': { bg: 'bg-slate-700/40', text: 'text-slate-500', label: 'Unknown' },
};

const SELLOUT_STYLES = {
  High: 'bg-red-900/30 text-red-400',
  Medium: 'bg-amber-900/30 text-amber-400',
  Low: 'bg-slate-700/30 text-slate-400',
  Unknown: 'bg-slate-700/30 text-slate-500',
};

function makeEventKey(name, venue, date) {
  const n = (name || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const v = (venue || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const d = (date || '').slice(0, 10);
  return `${n}::${v}::${d}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Arizona() {
  const [events, setEvents] = useState([]);
  const [velocityData, setVelocityData] = useState({});
  const [lastScan, setLastScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [venueFilter, setVenueFilter] = useState('All');

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [evRes, velRes] = await Promise.allSettled([
        api.getArizonaEvents(),
        api.getArizonaVelocity(),
      ]);
      if (evRes.status === 'fulfilled') setEvents(evRes.value.events || []);
      if (velRes.status === 'fulfilled') {
        setVelocityData(velRes.value.velocity || {});
        setLastScan(velRes.value.lastScan);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  async function handleScan() {
    setScanning(true);
    try {
      await api.scanArizona();
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  // Merge events with velocity data
  const enrichedEvents = useMemo(() => {
    return events.map(ev => {
      const key = makeEventKey(ev.name, ev.venue, ev.date);
      const vel = velocityData[key] || {};
      return { ...ev, ...vel, _key: key };
    });
  }, [events, velocityData]);

  // Filter and sort
  const displayEvents = useMemo(() => {
    let filtered = enrichedEvents;
    if (venueFilter !== 'All') {
      filtered = filtered.filter(ev => ev.venueSize === venueFilter);
    }

    const velOrder = { 'Very Fast': 0, 'Fast': 1, 'Moderate': 2, 'Slow': 3, 'Increasing': 4, 'Unknown': 5 };

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'velocity':
          return (velOrder[a.velocity] ?? 5) - (velOrder[b.velocity] ?? 5);
        case 'price': {
          const pa = a.seatgeekPrice || a.ticketmasterPrice || 9999;
          const pb = b.seatgeekPrice || b.ticketmasterPrice || 9999;
          return pa - pb;
        }
        case 'demand':
          return (b.demandScore || 0) - (a.demandScore || 0);
        default:
          return (a.date || '').localeCompare(b.date || '');
      }
    });
  }, [enrichedEvents, sortBy, venueFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-emerald-400" />
            Arizona Concerts
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Tracking {displayEvents.length} events
            {lastScan && <span className="ml-2">| Last scan: {timeAgo(lastScan)}</span>}
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white text-sm font-medium rounded transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning...' : 'Scan Now'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-zinc-800 border border-slate-700 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-slate-400" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded px-2 py-1"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <div className="flex gap-1">
            {VENUE_SIZES.map(size => (
              <button
                key={size}
                onClick={() => setVenueFilter(size)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  venueFilter === size
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
        </div>
      )}

      {/* Events Grid */}
      {!loading && displayEvents.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No Arizona events found. Click Scan Now to fetch events.</p>
        </div>
      )}

      {!loading && displayEvents.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {displayEvents.map(ev => {
            const velStyle = VELOCITY_STYLES[ev.velocity] || VELOCITY_STYLES.Unknown;
            const selloutStyle = SELLOUT_STYLES[ev.selloutLikelihood] || SELLOUT_STYLES.Unknown;
            const floorPrice = ev.seatgeekPrice || ev.ticketmasterPrice;

            return (
              <div
                key={ev.id || ev._key}
                className="bg-zinc-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
              >
                {/* Top: name + date */}
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-slate-100 leading-tight">
                    {ev.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(ev.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                    <Building2 className="w-3 h-3" />
                    <span>{ev.venue}, {ev.city}</span>
                  </div>
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {/* Venue size */}
                  {ev.venueSize && ev.venueSize !== 'Unknown' && (
                    <span className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300">
                      {ev.venueSize}
                      {ev.venueCapacity ? ` (${ev.venueCapacity.toLocaleString()})` : ''}
                    </span>
                  )}
                  {/* Velocity */}
                  <span className={`px-2 py-0.5 text-xs rounded ${velStyle.bg} ${velStyle.text}`}>
                    {velStyle.label}
                  </span>
                  {/* Sellout */}
                  <span className={`px-2 py-0.5 text-xs rounded ${selloutStyle}`}>
                    {ev.selloutLikelihood || 'Unknown'} Sellout
                  </span>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Price */}
                  <div className="bg-slate-900/50 rounded p-2">
                    <div className="text-slate-500 mb-0.5">Floor Price</div>
                    <div className="text-slate-200 font-medium">
                      {floorPrice ? formatCurrency(floorPrice) : '--'}
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded p-2">
                    <div className="text-slate-500 mb-0.5">Avg Price</div>
                    <div className="text-slate-200 font-medium">
                      {ev.seatgeekAvgPrice ? formatCurrency(ev.seatgeekAvgPrice) : '--'}
                    </div>
                  </div>

                  {/* Listings */}
                  <div className="bg-slate-900/50 rounded p-2">
                    <div className="text-slate-500 mb-0.5">Listings</div>
                    <div className="text-slate-200 font-medium flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-500" />
                      {ev.listingCount != null ? ev.listingCount : '--'}
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded p-2">
                    <div className="text-slate-500 mb-0.5">Supply Ratio</div>
                    <div className="text-slate-200 font-medium">
                      {ev.supplyRatio != null ? `${ev.supplyRatio}%` : '--'}
                    </div>
                  </div>

                  {/* Daily change */}
                  <div className="bg-slate-900/50 rounded p-2">
                    <div className="text-slate-500 mb-0.5">Daily Change</div>
                    <div className={`font-medium flex items-center gap-1 ${
                      (ev.dailyChange || 0) < 0 ? 'text-emerald-400' :
                      (ev.dailyChange || 0) > 0 ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {(ev.dailyChange || 0) < 0 ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (ev.dailyChange || 0) > 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : null}
                      {ev.dailyChange != null ? `${ev.dailyChange > 0 ? '+' : ''}${ev.dailyChange}/day` : '--'}
                    </div>
                  </div>

                  {/* Price direction */}
                  <div className="bg-slate-900/50 rounded p-2">
                    <div className="text-slate-500 mb-0.5">Price Trend</div>
                    <div className={`font-medium ${
                      ev.priceDirection === 'Rising' ? 'text-emerald-400' :
                      ev.priceDirection === 'Falling' ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {ev.priceDirection === 'Rising' && '\u2191 '}
                      {ev.priceDirection === 'Falling' && '\u2193 '}
                      {ev.priceDirection || 'Stable'}
                    </div>
                  </div>
                </div>

                {/* Tracking info */}
                {ev.daysTracked > 0 && (
                  <div className="mt-2 text-xs text-slate-500">
                    Tracked for {ev.daysTracked} day{ev.daysTracked !== 1 ? 's' : ''}
                    {ev.snapshots && ev.snapshots.length > 0 && ` | ${ev.snapshots.length} snapshots`}
                  </div>
                )}

                {/* Demand score bar */}
                {ev.demandScore != null && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-500">Demand Score</span>
                      <span className="text-slate-300">{ev.demandScore}</span>
                    </div>
                    <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          ev.demandScore >= 80 ? 'bg-red-500' :
                          ev.demandScore >= 50 ? 'bg-amber-500' : 'bg-slate-500'
                        }`}
                        style={{ width: `${ev.demandScore}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
