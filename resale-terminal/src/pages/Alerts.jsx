import { useState, useEffect, useMemo } from 'react';
import { Bell, SlidersHorizontal } from 'lucide-react';
import AlertCard from '../components/AlertCard';
import { useSearch } from '../hooks/useSearch';

export default function Alerts() {
  const { results, loading, error, search } = useSearch();
  const [minMultiplier, setMinMultiplier] = useState(2.0);
  const [sortBy, setSortBy] = useState('multiplier');
  const [hasSearched, setHasSearched] = useState(false);

  // Auto-search on mount for broad results
  useEffect(() => {
    if (!hasSearched) {
      search('concert');
      setHasSearched(true);
    }
  }, [hasSearched, search]);

  const filteredAlerts = useMemo(() => {
    return results
      .filter((event) => {
        if (!event.seatgeekPrice || !event.ticketmasterPrice || event.ticketmasterPrice === 0) {
          return false;
        }
        const multiplier = event.seatgeekPrice / event.ticketmasterPrice;
        return multiplier >= minMultiplier;
      })
      .sort((a, b) => {
        const multA = a.seatgeekPrice / a.ticketmasterPrice;
        const multB = b.seatgeekPrice / b.ticketmasterPrice;

        switch (sortBy) {
          case 'multiplier':
            return multB - multA;
          case 'demand':
            return (b.demandScore || 0) - (a.demandScore || 0);
          case 'date':
            return new Date(a.date) - new Date(b.date);
          default:
            return 0;
        }
      });
  }, [results, minMultiplier, sortBy]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-1 flex items-center gap-2">
          <Bell className="w-6 h-6 text-emerald-400" />
          Market Alerts
        </h1>
        <p className="text-sm text-slate-400">
          High-opportunity events where resale exceeds face value
        </p>
      </div>

      {/* Filter Controls */}
      <div className="bg-zinc-800 rounded-lg border border-slate-700 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <SlidersHorizontal className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-300">Filters</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">
              Minimum Multiplier: {minMultiplier.toFixed(1)}x
            </label>
            <input
              type="range"
              min="1.5"
              max="5"
              step="0.1"
              value={minMultiplier}
              onChange={(e) => setMinMultiplier(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>1.5x</span>
              <span>5.0x</span>
            </div>
          </div>
          <div className="sm:w-48">
            <label className="block text-xs text-slate-400 mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-400"
            >
              <option value="multiplier">Multiplier</option>
              <option value="demand">Demand Score</option>
              <option value="date">Date</option>
            </select>
          </div>
        </div>
      </div>

      {/* Quick search buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['concert', 'NBA', 'NFL', 'MLB', 'theater', 'festival'].map((term) => (
          <button
            key={term}
            onClick={() => search(term)}
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 border border-slate-600 rounded-lg text-slate-300 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors"
          >
            {term}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Scanning for opportunities...</p>
          </div>
        </div>
      )}

      {!loading && filteredAlerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAlerts.map((event) => (
            <AlertCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {!loading && filteredAlerts.length === 0 && results.length > 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Bell className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-lg">No high-opportunity events found</p>
          <p className="text-sm mt-1">Try adjusting your filters or search different categories</p>
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Bell className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-lg">No events loaded yet</p>
          <p className="text-sm mt-1">Click a category above to scan for opportunities</p>
        </div>
      )}
    </div>
  );
}
