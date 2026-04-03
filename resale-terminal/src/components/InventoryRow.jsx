import { Pencil, DollarSign, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate, formatPercent } from '../lib/format';

export default function InventoryRow({ item, onSell, onDelete }) {
  const isSold = !!item.sold_price;
  const currentValue = isSold ? item.sold_price : (item.current_value || item.purchase_price || 0);
  const purchasePrice = item.purchase_price || 0;
  const gainLoss = (currentValue - purchasePrice) * (item.quantity || 1);
  const gainLossPct = purchasePrice > 0 ? ((currentValue - purchasePrice) / purchasePrice) * 100 : 0;
  const isPositive = gainLoss >= 0;

  return (
    <>
      {/* Desktop row */}
      <div
        className={`hidden lg:grid grid-cols-[2fr_1fr_1fr_0.5fr_1fr_1fr_1fr_0.8fr_1fr] gap-2 px-4 py-3 items-center text-sm hover:bg-slate-800/50 transition-colors ${
          isSold ? 'opacity-60' : ''
        }`}
      >
        <span className={`font-medium text-slate-200 line-clamp-1 ${isSold ? 'line-through' : ''}`}>
          {item.event_name}
        </span>
        <span className="text-slate-400">{formatDate(item.event_date)}</span>
        <span className="text-slate-400">{item.seat_location || '—'}</span>
        <span className="text-slate-300">{item.quantity || 1}</span>
        <span className="text-slate-300">{formatCurrency(purchasePrice)}</span>
        <span className="text-slate-300">{formatCurrency(currentValue)}</span>
        <span className={isPositive ? 'text-emerald-400' : 'text-red-400'}>
          {isPositive ? '+' : ''}{formatCurrency(gainLoss)}
          <span className="text-xs ml-1 opacity-75">
            {formatPercent(gainLossPct)}
          </span>
        </span>
        <span>
          {isSold ? (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-slate-600/30 text-slate-400 border border-slate-600/50 rounded-full">
              Sold
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
              Active
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          {!isSold && (
            <>
              <button
                onClick={() => onSell(item)}
                title="Mark as Sold"
                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 rounded transition-colors"
              >
                <DollarSign className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(item.id)}
                title="Delete"
                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </span>
      </div>

      {/* Mobile card */}
      <div
        className={`lg:hidden px-4 py-3 ${isSold ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className={`font-medium text-slate-200 ${isSold ? 'line-through' : ''}`}>
              {item.event_name}
            </p>
            <p className="text-xs text-slate-400">
              {formatDate(item.event_date)} &middot; {item.seat_location || 'No seat info'}
            </p>
          </div>
          {isSold ? (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-slate-600/30 text-slate-400 border border-slate-600/50 rounded-full flex-shrink-0">
              Sold
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex-shrink-0">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex gap-4">
            <div>
              <span className="text-xs text-slate-500">Cost: </span>
              <span className="text-slate-300">{formatCurrency(purchasePrice)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500">Value: </span>
              <span className="text-slate-300">{formatCurrency(currentValue)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500">P&L: </span>
              <span className={isPositive ? 'text-emerald-400' : 'text-red-400'}>
                {isPositive ? '+' : ''}{formatCurrency(gainLoss)}
              </span>
            </div>
          </div>
          {!isSold && (
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => onSell(item)}
                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 rounded transition-colors"
              >
                <DollarSign className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(item.id)}
                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
