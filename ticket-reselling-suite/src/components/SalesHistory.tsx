"use client";

import { useState, useEffect } from "react";

interface SaleRecord {
  id: string;
  saleDate: string;
  platform: string;
  salePrice: number;
  quantitySold: number;
  netRevenue: number;
  inventory: {
    purchasePrice: number;
    event: {
      name: string;
      date: string;
      venue: string;
    };
  };
  profit: number;
  roi: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  STUBHUB: "StubHub",
  TICKETMASTER: "Ticketmaster",
  VIVID_SEATS: "Vivid Seats",
  SEATGEEK: "SeatGeek",
  ETIX: "Etix",
  AXS: "AXS",
  TICKPICK: "TickPick",
  GAMETIME: "Gametime",
  OTHER: "Other",
};

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SalesHistory() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(90);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sales/history?days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setSales(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [days]);

  const totalRevenue = sales.reduce((s, r) => s + r.netRevenue, 0);
  const totalProfit = sales.reduce((s, r) => s + r.profit, 0);
  const avgRoi =
    sales.length > 0
      ? sales.reduce((s, r) => s + r.roi, 0) / sales.length
      : 0;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-warm-500">Sales History</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-warm-500">Show:</span>
          {[30, 60, 90, 365].map((d) => (
            <button
              key={d}
              className={d === days ? "btn-primary text-xs py-1 px-3" : "btn-ghost text-xs"}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center py-4">
          <div className="text-xs text-warm-500 mb-1">Total Revenue</div>
          <div className="text-xl font-bold text-warm-900">${fmt(totalRevenue)}</div>
        </div>
        <div className="card text-center py-4">
          <div className="text-xs text-warm-500 mb-1">Total Profit</div>
          <div
            className={`text-xl font-bold ${
              totalProfit >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {totalProfit < 0 ? "-" : ""}${fmt(Math.abs(totalProfit))}
          </div>
        </div>
        <div className="card text-center py-4">
          <div className="text-xs text-warm-500 mb-1">Avg ROI</div>
          <div
            className={`text-xl font-bold ${
              avgRoi >= 0 ? "text-amber-600" : "text-red-600"
            }`}
          >
            {fmt(avgRoi)}%
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load sales history: {error}
        </div>
      )}

      {/* Table */}
      <div style={{ opacity: loading && sales.length > 0 ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        {loading && sales.length === 0 ? (
          <div className="card text-center py-12 text-warm-400 text-sm">
            Loading sales history…
          </div>
        ) : !loading && sales.length === 0 ? (
          <div className="card text-center py-12 text-warm-500">
            No sales recorded in the last {days} days. Record your first sale from
            the Inventory tab.
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-200 bg-warm-50">
                    <th className="text-left px-4 py-3 font-medium text-warm-500">
                      Event
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-warm-500">
                      Venue
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-warm-500">
                      Platform
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-warm-500">
                      Sale Date
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-warm-500">
                      Qty
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-warm-500">
                      Price/Ticket
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-warm-500">
                      Net Revenue
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-warm-500">
                      Profit
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-warm-500">
                      ROI
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale, i) => (
                    <tr
                      key={sale.id}
                      className={`border-b border-warm-100 hover:bg-warm-50 transition-colors ${
                        i % 2 === 0 ? "" : "bg-warm-50/40"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-warm-900 truncate max-w-[200px]">
                          {sale.inventory?.event?.name ?? "Unknown"}
                        </div>
                        <div className="text-xs text-warm-400">
                          {sale.inventory?.event?.date ? fmtDate(sale.inventory.event.date) : "\u2014"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-warm-600 truncate max-w-[160px]">
                        {sale.inventory?.event?.venue ?? ""}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          {PLATFORM_LABELS[sale.platform] ?? sale.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-warm-600">
                        {fmtDate(sale.saleDate)}
                      </td>
                      <td className="px-4 py-3 text-right text-warm-700">
                        {sale.quantitySold}
                      </td>
                      <td className="px-4 py-3 text-right text-warm-700">
                        ${fmt(sale.salePrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-warm-900">
                        ${fmt(sale.netRevenue)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          sale.profit >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {sale.profit < 0 ? "-" : "+"}${fmt(Math.abs(sale.profit))}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          sale.roi >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {fmt(sale.roi)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
