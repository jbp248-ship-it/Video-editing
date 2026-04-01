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

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

// Icon SVGs matched to each stat category
function StatIcon({ type }: { type: string }) {
  const base = "h-4 w-4";
  switch (type) {
    case "invested":
      return (
        <svg className={base} viewBox="0 0 20 20" fill="currentColor">
          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.077 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.077-2.354-1.253V5z" clipRule="evenodd" />
        </svg>
      );
    case "listed":
      return (
        <svg className={base} viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
        </svg>
      );
    case "revenue":
      return (
        <svg className={base} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd" />
        </svg>
      );
    case "profit":
      return (
        <svg className={base} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
        </svg>
      );
    case "listings":
      return (
        <svg className={base} viewBox="0 0 20 20" fill="currentColor">
          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
          <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
        </svg>
      );
    case "removal":
      return (
        <svg className={base} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    case "events":
      return (
        <svg className={base} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
        </svg>
      );
    case "margin":
      return (
        <svg className={base} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    default:
      return null;
  }
}

export function StatsGrid({ stats }: StatsGridProps) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="stat-card animate-pulse">
            <div className="skeleton h-3 w-16 rounded mb-1" />
            <div className="skeleton h-7 w-24 rounded mt-1" />
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
      iconType: "invested",
      iconColor: "text-brand-500",
    },
    {
      label: "Listed Value",
      value: formatCurrency(stats.totalListedValue),
      color: "text-brand-500",
      iconType: "listed",
      iconColor: "text-brand-500",
    },
    {
      label: "Net Revenue",
      value: formatCurrency(stats.totalSalesRevenue),
      color: "text-warm-900",
      iconType: "revenue",
      iconColor: "text-brand-500",
    },
    {
      label: "Net Profit",
      value: formatCurrency(stats.totalProfit),
      color: stats.totalProfit >= 0 ? "text-green-600" : "text-red-600",
      iconType: "profit",
      iconColor: stats.totalProfit >= 0 ? "text-green-600" : "text-red-600",
    },
    {
      label: "Active Listings",
      value: formatNumber(stats.activeListings),
      color: "text-brand-500",
      iconType: "listings",
      iconColor: "text-brand-500",
    },
    {
      label: "Pending Removals",
      value: formatNumber(stats.pendingRemovals),
      color: stats.pendingRemovals > 0 ? "text-red-600" : "text-warm-500",
      iconType: "removal",
      iconColor: stats.pendingRemovals > 0 ? "text-red-500" : "text-warm-400",
    },
    {
      label: "Events Tracked",
      value: formatNumber(stats.eventsTracked),
      color: "text-warm-900",
      iconType: "events",
      iconColor: "text-brand-500",
    },
    {
      label: "Avg. Margin",
      value: `${stats.avgMarginPercent}%`,
      color: stats.avgMarginPercent >= 0 ? "text-green-600" : "text-red-600",
      iconType: "margin",
      iconColor: stats.avgMarginPercent >= 0 ? "text-green-600" : "text-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="stat-card group">
          <div className={`stat-icon ${card.iconColor}`}>
            <StatIcon type={card.iconType} />
          </div>
          <span className="stat-label">{card.label}</span>
          <span className={`stat-value ${card.color}`}>{card.value}</span>
        </div>
      ))}
    </div>
  );
}
