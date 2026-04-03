import { TrendingUp, DollarSign, Wallet, BarChart3 } from 'lucide-react';
import PnLProgressBar from '../components/PnLProgressBar';
import { useInventory } from '../hooks/useInventory';
import { formatCurrency, formatDate, formatPercent } from '../lib/format';

export default function PnL() {
  const { items, summary, loading } = useInventory();

  const soldItems = items.filter((item) => item.sold_price);
  const recentSales = soldItems.slice(-10).reverse();

  const avgMargin =
    soldItems.length > 0
      ? soldItems.reduce(
          (sum, item) => sum + ((item.sold_price || 0) - (item.purchase_price || 0)),
          0
        ) / soldItems.length
      : 0;

  const bestEvent =
    soldItems.length > 0
      ? soldItems.reduce((best, item) => {
          const profit = ((item.sold_price || 0) - (item.purchase_price || 0)) * (item.quantity || 1);
          const bestProfit =
            ((best.sold_price || 0) - (best.purchase_price || 0)) * (best.quantity || 1);
          return profit > bestProfit ? item : best;
        }, soldItems[0])
      : null;

  const bestEventProfit = bestEvent
    ? ((bestEvent.sold_price || 0) - (bestEvent.purchase_price || 0)) * (bestEvent.quantity || 1)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading P&L data...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-emerald-400" />
          P&L Tracker
        </h1>
        <p className="text-sm text-slate-400 mt-1">Track your progress toward the $10,000 goal</p>
      </div>

      {/* Progress Ring + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Progress Ring */}
        <div className="lg:col-span-1 flex justify-center">
          <PnLProgressBar current={summary.realizedProfit} goal={10000} />
        </div>

        {/* Stats Grid */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-zinc-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400 uppercase tracking-wide">Total Invested</span>
            </div>
            <p className="text-2xl font-bold text-slate-100">
              {formatCurrency(summary.totalInvested)}
            </p>
          </div>

          <div className="bg-zinc-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400 uppercase tracking-wide">Portfolio Value</span>
            </div>
            <p className="text-2xl font-bold text-slate-100">
              {formatCurrency(summary.currentValue)}
            </p>
          </div>

          <div className="bg-zinc-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-slate-400 uppercase tracking-wide">Realized Profit</span>
            </div>
            <p
              className={`text-2xl font-bold ${
                summary.realizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {summary.realizedProfit >= 0 ? '+' : ''}
              {formatCurrency(summary.realizedProfit)}
            </p>
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-zinc-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wide">Avg Margin/Ticket</span>
          </div>
          <p
            className={`text-xl font-bold ${
              avgMargin >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {avgMargin >= 0 ? '+' : ''}
            {formatCurrency(avgMargin)}
          </p>
        </div>

        <div className="bg-zinc-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Best Event</p>
          {bestEvent ? (
            <>
              <p className="text-sm font-semibold text-slate-100 line-clamp-1">
                {bestEvent.event_name}
              </p>
              <p className="text-sm text-emerald-400 mt-1">
                +{formatCurrency(bestEventProfit)}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">No sales yet</p>
          )}
        </div>

        <div className="bg-zinc-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Tickets Sold</p>
          <p className="text-xl font-bold text-slate-100">{summary.soldItems}</p>
          <p className="text-xs text-slate-500 mt-1">
            of {summary.totalItems} total
          </p>
        </div>
      </div>

      {/* Recent Sales */}
      <div className="bg-zinc-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Recent Sales
          </h2>
        </div>
        {recentSales.length > 0 ? (
          <div className="divide-y divide-slate-700/50">
            {recentSales.map((item) => {
              const profit =
                ((item.sold_price || 0) - (item.purchase_price || 0)) * (item.quantity || 1);
              const marginPct =
                item.purchase_price > 0
                  ? ((item.sold_price - item.purchase_price) / item.purchase_price) * 100
                  : 0;

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 line-clamp-1">
                      {item.event_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Sold {formatDate(item.sold_at)} &middot; {item.quantity || 1} ticket
                      {(item.quantity || 1) > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p
                      className={`text-sm font-semibold ${
                        profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {profit >= 0 ? '+' : ''}
                      {formatCurrency(profit)}
                    </p>
                    <p
                      className={`text-xs ${
                        marginPct >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'
                      }`}
                    >
                      {formatPercent(marginPct)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No sales recorded yet. Mark inventory items as sold to track your P&L.
          </div>
        )}
      </div>
    </div>
  );
}
