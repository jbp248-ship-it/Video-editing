"use client";

import type { DashboardStats } from "@/types";

interface StatsGridProps {
  stats: DashboardStats | null;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function StatsGrid({ stats }: StatsGridProps) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="stat-card animate-pulse">
            <div className="h-4 w-20 bg-slate-700 rounded" />
            <div className="h-8 w-28 bg-slate-700 rounded mt-2" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Total Invested",
      value: formatCurrency(stats.totalInventoryValue),
      color: "text-white",
    },
    {
      label: "Listed Value",
      value: formatCurrency(stats.totalListedValue),
      color: "text-sky-400",
    },
    {
      label: "Net Revenue",
      value: formatCurrency(stats.totalSalesRevenue),
      color: "text-white",
    },
    {
      label: "Net Profit",
      value: formatCurrency(stats.totalProfit),
      color: stats.totalProfit >= 0 ? "text-green-400" : "text-red-400",
    },
    {
      label: "Active Listings",
      value: stats.activeListings.toString(),
      color: "text-sky-400",
    },
    {
      label: "Pending Removals",
      value: stats.pendingRemovals.toString(),
      color: stats.pendingRemovals > 0 ? "text-red-400" : "text-slate-400",
    },
    {
      label: "Events Tracked",
      value: stats.eventsTracked.toString(),
      color: "text-white",
    },
    {
      label: "Avg. Margin",
      value: `${stats.avgMarginPercent}%`,
      color: stats.avgMarginPercent >= 0 ? "text-green-400" : "text-red-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="stat-card">
          <span className="stat-label">{card.label}</span>
          <span className={`stat-value ${card.color}`}>{card.value}</span>
        </div>
      ))}
    </div>
  );
}
