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
            <div className="h-4 w-20 bg-warm-200 rounded" />
            <div className="h-8 w-28 bg-warm-200 rounded mt-2" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Total Invested",
      value: formatCurrency(stats.totalInventoryValue),
      color: "text-warm-900",
    },
    {
      label: "Listed Value",
      value: formatCurrency(stats.totalListedValue),
      color: "text-brand-500",
    },
    {
      label: "Net Revenue",
      value: formatCurrency(stats.totalSalesRevenue),
      color: "text-warm-900",
    },
    {
      label: "Net Profit",
      value: formatCurrency(stats.totalProfit),
      color: stats.totalProfit >= 0 ? "text-green-600" : "text-red-600",
    },
    {
      label: "Active Listings",
      value: stats.activeListings.toString(),
      color: "text-brand-500",
    },
    {
      label: "Pending Removals",
      value: stats.pendingRemovals.toString(),
      color: stats.pendingRemovals > 0 ? "text-red-600" : "text-warm-500",
    },
    {
      label: "Events Tracked",
      value: stats.eventsTracked.toString(),
      color: "text-warm-900",
    },
    {
      label: "Avg. Margin",
      value: `${stats.avgMarginPercent}%`,
      color: stats.avgMarginPercent >= 0 ? "text-green-600" : "text-red-600",
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
