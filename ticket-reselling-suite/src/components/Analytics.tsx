"use client";

import { useState, useEffect } from "react";

interface AnalyticsData {
  summary: {
    totalCapitalInvested: number;
    activeInventoryValue: number;
    estimatedMarketValue: number;
    unrealizedGain: number;
    totalRevenue: number;
    totalProfit: number;
    totalFees: number;
    allTimeROI: number;
    totalSales: number;
    activeTickets: number;
  };
  platformBreakdown: Array<{
    platform: string;
    sales: number;
    revenue: number;
    profit: number;
    fees: number;
    roi: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    revenue: number;
    profit: number;
    sales: number;
    invested: number;
  }>;
  topEvents: Array<{
    name: string;
    profit: number;
    revenue: number;
    sales: number;
  }>;
}

const PLATFORM_LABELS: Record<string, string> = {
  STUBHUB: "StubHub", TICKETMASTER: "Ticketmaster", VIVID_SEATS: "Vivid Seats",
  SEATGEEK: "SeatGeek", ETIX: "Etix", AXS: "AXS", TICKPICK: "TickPick",
  GAMETIME: "Gametime", OTHER: "Other",
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

export function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border border-red-200 bg-red-50 text-red-700 text-sm p-4">
        Failed to load analytics: {error}
      </div>
    );
  }

  if (!data) return null;
  const s = data.summary;

  return (
    <div className="space-y-6">
      {/* ── P&L Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Capital Invested" value={fmt(s.totalCapitalInvested)} />
        <StatCard label="Active Inventory" value={fmt(s.activeInventoryValue)} sub={`${s.activeTickets} tickets`} />
        <StatCard
          label="Est. Market Value"
          value={fmt(s.estimatedMarketValue)}
          sub={s.unrealizedGain >= 0 ? `+${fmt(s.unrealizedGain)} unrealized` : `${fmt(s.unrealizedGain)} unrealized`}
          color={s.unrealizedGain >= 0 ? "#16a34a" : "#dc2626"}
        />
        <StatCard
          label="Realized Profit"
          value={fmt(s.totalProfit)}
          sub={`${s.totalSales} sales`}
          color={s.totalProfit >= 0 ? "#16a34a" : "#dc2626"}
        />
        <StatCard
          label="All-Time ROI"
          value={fmtPct(s.allTimeROI)}
          sub={`${fmt(s.totalFees)} in fees`}
          color={s.allTimeROI >= 0 ? "#16a34a" : "#dc2626"}
        />
      </div>

      {/* ── Revenue vs Profit vs Investment — Monthly Bar Chart ── */}
      <div className="card">
        <h3 className="text-sm font-medium text-warm-500 mb-4">Monthly Trends (Last 12 Months)</h3>
        <div className="overflow-x-auto">
          <div className="flex items-end gap-1 h-48 min-w-[600px]">
            {data.monthlyTrends.map((m) => {
              const maxVal = Math.max(
                ...data.monthlyTrends.map((t) => Math.max(t.revenue, t.invested, 1))
              );
              const revH = maxVal > 0 ? (m.revenue / maxVal) * 160 : 0;
              const profH = maxVal > 0 ? (Math.abs(m.profit) / maxVal) * 160 : 0;
              const invH = maxVal > 0 ? (m.invested / maxVal) * 160 : 0;
              const monthLabel = m.month.split("-")[1];
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5" title={`${m.month}: Rev ${fmt(m.revenue)}, Profit ${fmt(m.profit)}, Invested ${fmt(m.invested)}`}>
                  <div className="flex items-end gap-px w-full justify-center">
                    <div style={{ height: `${invH}px`, backgroundColor: "#E5E0D8", width: "6px", borderRadius: "2px 2px 0 0" }} />
                    <div style={{ height: `${revH}px`, backgroundColor: "#D97706", width: "6px", borderRadius: "2px 2px 0 0" }} />
                    <div style={{ height: `${profH}px`, backgroundColor: m.profit >= 0 ? "#16a34a" : "#dc2626", width: "6px", borderRadius: "2px 2px 0 0" }} />
                  </div>
                  <span className="text-[10px] text-warm-400">{monthLabel}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-warm-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#E5E0D8" }} /> Invested</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#D97706" }} /> Revenue</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#16a34a" }} /> Profit</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Platform Breakdown ── */}
        <div className="card">
          <h3 className="text-sm font-medium text-warm-500 mb-4">Platform Breakdown</h3>
          {data.platformBreakdown.length === 0 ? (
            <p className="text-sm text-warm-400">No sales recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200 text-warm-500">
                  <th className="text-left py-2 font-medium">Platform</th>
                  <th className="text-right py-2 font-medium">Sales</th>
                  <th className="text-right py-2 font-medium">Revenue</th>
                  <th className="text-right py-2 font-medium">Profit</th>
                  <th className="text-right py-2 font-medium">Fees</th>
                  <th className="text-right py-2 font-medium">ROI</th>
                </tr>
              </thead>
              <tbody>
                {data.platformBreakdown.map((p) => (
                  <tr key={p.platform} className="border-b border-warm-100 hover:bg-warm-50">
                    <td className="py-2.5 font-medium text-warm-800">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#D97706" }} />
                        {PLATFORM_LABELS[p.platform] ?? p.platform}
                      </span>
                    </td>
                    <td className="text-right py-2.5 text-warm-600">{p.sales}</td>
                    <td className="text-right py-2.5 text-warm-700">{fmt(p.revenue)}</td>
                    <td className="text-right py-2.5" style={{ color: p.profit >= 0 ? "#16a34a" : "#dc2626" }}>
                      {fmt(p.profit)}
                    </td>
                    <td className="text-right py-2.5 text-warm-500">{fmt(p.fees)}</td>
                    <td className="text-right py-2.5" style={{ color: p.roi >= 0 ? "#16a34a" : "#dc2626" }}>
                      {fmtPct(p.roi)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Top Events by Profit ── */}
        <div className="card">
          <h3 className="text-sm font-medium text-warm-500 mb-4">Top Events by Profit</h3>
          {data.topEvents.length === 0 ? (
            <p className="text-sm text-warm-400">No sales recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {data.topEvents.map((e, i) => {
                const maxProfit = Math.max(...data.topEvents.map((t) => Math.abs(t.profit)), 1);
                const barW = (Math.abs(e.profit) / maxProfit) * 100;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-warm-400 w-5 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-warm-800 truncate">{e.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="h-2 rounded-full" style={{
                          width: `${barW}%`,
                          backgroundColor: e.profit >= 0 ? "#D97706" : "#dc2626",
                          minWidth: "4px",
                        }} />
                        <span className="text-xs font-medium whitespace-nowrap" style={{ color: e.profit >= 0 ? "#16a34a" : "#dc2626" }}>
                          {fmt(e.profit)}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-warm-500">{e.sales} sale{e.sales !== 1 ? "s" : ""}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-warm-500 font-medium mb-1">{label}</div>
      <div className="text-xl font-bold" style={{ color: color ?? "#1C1A14" }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: color ?? "#8B7E5A" }}>{sub}</div>}
    </div>
  );
}
