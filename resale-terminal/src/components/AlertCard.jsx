import { Calendar, MapPin, Plus } from 'lucide-react';
import { formatCurrency, formatDate, formatMultiplier } from '../lib/format';

export default function AlertCard({ event, onAddToInventory }) {
  const multiplier =
    event.seatgeekPrice && event.ticketmasterPrice && event.ticketmasterPrice > 0
      ? event.seatgeekPrice / event.ticketmasterPrice
      : 0;

  const multiplierText = formatMultiplier(event.seatgeekPrice, event.ticketmasterPrice);
  const multiplierColor = multiplier >= 3 ? 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30' : 'text-amber-400 bg-amber-500/20 border-amber-500/30';

  return (
    <div className="bg-zinc-800 rounded-lg border border-slate-700 p-4 hover:border-emerald-500/50 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-slate-100 line-clamp-1">
            {event.name}
          </h3>
          <div className="flex items-center gap-3 text-sm text-slate-400 mt-1">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(event.date)}
            </span>
            {event.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span className="line-clamp-1">{event.venue}</span>
              </span>
            )}
          </div>
        </div>

        {/* Large multiplier badge */}
        <div className={`flex-shrink-0 px-3 py-2 rounded-lg border text-xl font-bold ${multiplierColor}`}>
          {multiplierText}
        </div>
      </div>

      {/* Prices */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Face Value</p>
          <p className="text-sm font-semibold text-slate-300">
            {formatCurrency(event.ticketmasterPrice)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Resale Price</p>
          <p className="text-sm font-semibold text-emerald-400">
            {formatCurrency(event.seatgeekPrice)}
          </p>
        </div>
      </div>

      {/* Demand Score */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">Demand Score</span>
        <span className="text-sm font-semibold text-slate-300">{event.demandScore}</span>
      </div>

      <button
        onClick={() => onAddToInventory && onAddToInventory(event)}
        className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add to Inventory
      </button>
    </div>
  );
}
