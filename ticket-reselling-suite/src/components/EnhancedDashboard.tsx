"use client";

import { useState, useEffect } from "react";
import { PriceTrendChart } from "./PriceTrendChart";
import { InventoryTable } from "./InventoryTable";

// ── Types ──────────────────────────────────────────────────────────────────

interface AnalyticsSummary {
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
}

interface FlareEvent {
  eventId: string;
  eventName: string;
  venue: string;
  eventDate: string;
  daysOut: number;
  flareScore: number;
  signal: "GREEN" | "YELLOW" | "RED";
  breakdown: {
    floorScore: number;
    listingScore: number;
    ageScore: number;
    velocityScore: number;
    exposureScore: number;
  };
  riskReward: {
    totalInvested: number;
    currentFloor: number;
    estimatedResale: number;
    projectedUpside: number;
    lossProbability: number;
  };
  ticketsHeld: number;
  ticketsAvailable: number | null;
}

interface EnhancedDashboardProps {
  snapshots: any[];
  inventory: any[];
  alerts: any[];
  onRecordSale: (id: string) => void;
  onNavigate?: (tab: string) => void;
  onDismissAlerts: (ids: string[]) => void;
  onMarkRead: (ids: string[]) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SIGNAL_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  GREEN: { label: "BUY", bg: "#dcfce7", text: "#166534", border: "#bbf7d0" },
  YELLOW: { label: "HOLD", bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
  RED: { label: "AVOID", bg: "#fee2e2", text: "#991b1b", border: "#fecaca" },
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ── Skeleton Loaders ───────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div
      className="animate-pulse rounded-xl p-4"
      style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(61,57,41,0.06)" }}
    >
      <div className="rounded h-3 w-20 mb-2" style={{ backgroundColor: "#E8E2DB" }} />
      <div className="rounded h-6 w-28 mb-1" style={{ backgroundColor: "#E8E2DB" }} />
      <div className="rounded h-3 w-16" style={{ backgroundColor: "#F0EDE8" }} />
    </div>
  );
}

function FlareCardSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg p-3"
      style={{ backgroundColor: "#FAF9F6", border: "1px solid #F0EDE8" }}
    >
      <div className="rounded h-3.5 w-3/4 mb-2" style={{ backgroundColor: "#E8E2DB" }} />
      <div className="flex items-center gap-2">
        <div className="rounded-full h-5 w-12" style={{ backgroundColor: "#E8E2DB" }} />
        <div className="rounded-full h-5 w-10" style={{ backgroundColor: "#F0EDE8" }} />
      </div>
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: "#FFFFFF",
        boxShadow: "0 1px 3px rgba(61,57,41,0.06)",
      }}
    >
      <div className="text-xs font-medium mb-1" style={{ color: "#8C8680" }}>
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color: color ?? "#3D3929" }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: color ?? "#A89F91" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Section Header ─────────────────────────────────────────────────────────

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold" style={{ color: "#3D3929" }}>
        {title}
      </h3>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="text-xs font-medium transition-colors"
          style={{ color: "#D97706" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#b45309")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#D97706")}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function EnhancedDashboard({
  snapshots,
  inventory,
  alerts,
  onRecordSale,
  onNavigate,
  onDismissAlerts,
  onMarkRead,
}: EnhancedDashboardProps) {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const [flareEvents, setFlareEvents] = useState<FlareEvent[]>([]);
  const [flareLoading, setFlareLoading] = useState(true);
  const [flareError, setFlareError] = useState<string | null>(null);

  // Fetch analytics on mount
  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setAnalytics(data.summary);
        setAnalyticsError(null);
      })
      .catch((err) => setAnalyticsError(err.message))
      .finally(() => setAnalyticsLoading(false));
  }, []);

  // Fetch FLARE data on mount
  useEffect(() => {
    fetch("/api/flare")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: FlareEvent[]) => {
        setFlareEvents(data);
        setFlareError(null);
      })
      .catch((err) => setFlareError(err.message))
      .finally(() => setFlareLoading(false));
  }, []);

  // Derived data
  const topFlareEvents = [...flareEvents]
    .sort((a, b) => b.flareScore - a.flareScore)
    .slice(0, 5);

  const unreadAlerts = alerts.filter((a) => !a.read).slice(0, 5);
  const limitedInventory = inventory.slice(0, 5);

  return (
    <div className="space-y-6" style={{ color: "#3D3929" }}>
      {/* ── Row 1: P&L Stats ─────────────────────────────────────────── */}
      {analyticsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : analyticsError ? (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            color: "#991b1b",
          }}
        >
          Failed to load analytics: {analyticsError}
        </div>
      ) : analytics ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            label="Total Capital Invested"
            value={fmt(analytics.totalCapitalInvested)}
          />
          <StatCard
            label="Active Inventory Value"
            value={fmt(analytics.activeInventoryValue)}
            sub={`${analytics.activeTickets} tickets`}
          />
          <StatCard
            label="Realized Profit"
            value={fmt(analytics.totalProfit)}
            sub={`${analytics.totalSales} sales`}
            color={analytics.totalProfit >= 0 ? "#16a34a" : "#dc2626"}
          />
          <StatCard
            label="All-Time ROI"
            value={fmtPct(analytics.allTimeROI)}
            sub={`${fmt(analytics.totalFees)} in fees`}
            color={analytics.allTimeROI >= 0 ? "#16a34a" : "#dc2626"}
          />
          <StatCard
            label="Est. Market Value"
            value={fmt(analytics.estimatedMarketValue)}
            sub={
              analytics.unrealizedGain >= 0
                ? `+${fmt(analytics.unrealizedGain)} unrealized`
                : `${fmt(analytics.unrealizedGain)} unrealized`
            }
            color={analytics.unrealizedGain >= 0 ? "#16a34a" : "#dc2626"}
          />
        </div>
      ) : null}

      {/* ── Row 2: Price Trend + FLARE Top Events ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Price Trend Chart (2/3) */}
        <div className="lg:col-span-2">
          <PriceTrendChart data={snapshots} title="Price Trend" />
        </div>

        {/* Right: Top FLARE Events (1/3) */}
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor: "#FFFFFF",
            boxShadow: "0 1px 3px rgba(61,57,41,0.06)",
          }}
        >
          <SectionHeader
            title="Top FLARE Events"
            actionLabel="View All →"
            onAction={() => onNavigate?.("market")}
          />

          {flareLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <FlareCardSkeleton key={i} />
              ))}
            </div>
          ) : flareError ? (
            <div className="text-sm py-4" style={{ color: "#dc2626" }}>
              Failed to load FLARE data
            </div>
          ) : topFlareEvents.length === 0 ? (
            <div className="text-sm py-8 text-center" style={{ color: "#A89F91" }}>
              No events tracked yet
            </div>
          ) : (
            <div className="space-y-2">
              {topFlareEvents.map((event) => {
                const sig = SIGNAL_CONFIG[event.signal];
                const scoreColor =
                  event.flareScore >= 70
                    ? "#16a34a"
                    : event.flareScore >= 40
                    ? "#d97706"
                    : "#dc2626";
                const scoreBg =
                  event.flareScore >= 70
                    ? "#dcfce7"
                    : event.flareScore >= 40
                    ? "#fef3c7"
                    : "#fee2e2";

                return (
                  <div
                    key={event.eventId}
                    className="rounded-lg p-3 transition-colors"
                    style={{
                      backgroundColor: "#FAF9F6",
                      border: "1px solid #F0EDE8",
                    }}
                  >
                    <div
                      className="text-sm font-medium truncate mb-1.5"
                      style={{ color: "#3D3929" }}
                      title={event.eventName}
                    >
                      {event.eventName}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* FLARE Score Badge */}
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{
                          backgroundColor: scoreBg,
                          color: scoreColor,
                        }}
                      >
                        {event.flareScore}
                      </span>
                      {/* Signal Badge */}
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor: sig.bg,
                          color: sig.text,
                          border: `1px solid ${sig.border}`,
                        }}
                      >
                        {sig.label}
                      </span>
                      {/* Days out */}
                      <span className="text-xs ml-auto" style={{ color: "#A89F91" }}>
                        {event.daysOut}d out
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Inventory Summary + Recent Alerts ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active Inventory (2/3) */}
        <div className="lg:col-span-2">
          <div
            className="rounded-xl p-4"
            style={{
              backgroundColor: "#FFFFFF",
              boxShadow: "0 1px 3px rgba(61,57,41,0.06)",
            }}
          >
            <SectionHeader
              title="Active Inventory"
              actionLabel="View All →"
              onAction={() => onNavigate?.("inventory")}
            />
            {limitedInventory.length === 0 ? (
              <div className="text-sm py-8 text-center" style={{ color: "#A89F91" }}>
                No inventory items yet
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <InventoryTable
                  items={limitedInventory}
                  onRecordSale={onRecordSale}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right: Recent Alerts (1/3) */}
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor: "#FFFFFF",
            boxShadow: "0 1px 3px rgba(61,57,41,0.06)",
          }}
        >
          <SectionHeader
            title="Recent Alerts"
            actionLabel="View All →"
            onAction={() => onNavigate?.("alerts")}
          />

          {unreadAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full mb-3"
                style={{ backgroundColor: "rgba(22,163,74,0.08)" }}
              >
                <svg
                  className="h-5 w-5"
                  style={{ color: "#16a34a" }}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: "#3D3929" }}>
                All clear
              </p>
              <p className="text-xs mt-1" style={{ color: "#A89F91" }}>
                No active alerts
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {unreadAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg p-3 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: "#FAF9F6",
                    border: "1px solid #F0EDE8",
                    borderLeftWidth: 3,
                    borderLeftColor: "#D97706",
                  }}
                  onClick={() => onMarkRead([alert.id])}
                >
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: "#3D3929" }}
                  >
                    {alert.title}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "#A89F91" }}>
                    {timeAgo(alert.createdAt)}
                  </div>
                </div>
              ))}
              {alerts.filter((a) => !a.read).length > 5 && (
                <div className="text-xs text-center pt-1" style={{ color: "#A89F91" }}>
                  +{alerts.filter((a) => !a.read).length - 5} more alerts
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
