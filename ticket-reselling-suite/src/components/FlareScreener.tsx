"use client";

import { useState, useEffect } from "react";

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

type SortKey =
  | "eventName"
  | "eventDate"
  | "venue"
  | "daysOut"
  | "flareScore"
  | "signal"
  | "ticketsHeld"
  | "ticketsAvailable"
  | "projectedUpside"
  | "lossProbability";

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

const SIGNAL_CONFIG = {
  GREEN: { label: "BUY", bg: "bg-green-100", text: "text-green-800", border: "border-green-200" },
  YELLOW: { label: "HOLD", bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200" },
  RED: { label: "AVOID", bg: "bg-red-100", text: "text-red-800", border: "border-red-200" },
};

const FLARE_LABELS: { key: keyof FlareEvent["breakdown"]; letter: string; label: string; max: number }[] = [
  { key: "floorScore", letter: "F", label: "Floor Price Trend", max: 25 },
  { key: "listingScore", letter: "L", label: "Listing Scarcity", max: 25 },
  { key: "ageScore", letter: "A", label: "Age to Event", max: 20 },
  { key: "velocityScore", letter: "R", label: "Resale Velocity", max: 15 },
  { key: "exposureScore", letter: "E", label: "Exposure Risk", max: 15 },
];

function FlareBar({ score }: { score: number }) {
  const color = score >= 70 ? "#16a34a" : score >= 40 ? "#d97706" : "#dc2626";
  const bgColor = score >= 70 ? "#dcfce7" : score >= 40 ? "#fef3c7" : "#fee2e2";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minWidth: 80,
        height: 24,
        borderRadius: 6,
        backgroundColor: bgColor,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${score}%`,
          backgroundColor: color,
          borderRadius: 6,
          transition: "width 0.4s ease",
        }}
      />
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          color: score >= 50 ? "#fff" : "#1c1917",
          mixBlendMode: score >= 50 ? "normal" : "normal",
        }}
      >
        {score}
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-warm-100">
      {Array.from({ length: 10 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="rounded bg-warm-200 animate-pulse"
            style={{ height: 16, width: i === 0 ? "70%" : "60%" }}
          />
        </td>
      ))}
    </tr>
  );
}

function BreakdownRow({ event }: { event: FlareEvent }) {
  const rr = event.riskReward;

  return (
    <tr className="border-b border-warm-100">
      <td colSpan={10} className="px-4 py-4" style={{ backgroundColor: "#FAF9F6" }}>
        <div className="grid grid-cols-2 gap-6">
          {/* FLARE Breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-3">
              FLARE Breakdown
            </h4>
            <div className="space-y-2">
              {FLARE_LABELS.map(({ key, letter, label, max }) => {
                const val = event.breakdown[key];
                const pct = (val / max) * 100;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span
                      className="flex-shrink-0 flex items-center justify-center rounded-md text-xs font-bold"
                      style={{
                        width: 28,
                        height: 28,
                        backgroundColor: "#fef3c7",
                        color: "#92400e",
                      }}
                    >
                      {letter}
                    </span>
                    <span className="text-xs text-warm-600 w-32 truncate">{label}</span>
                    <div
                      className="flex-1 rounded-full overflow-hidden"
                      style={{ height: 8, backgroundColor: "#e7e5e4" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: pct >= 70 ? "#16a34a" : pct >= 40 ? "#d97706" : "#dc2626",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-warm-700 w-12 text-right">
                      {val}/{max}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Risk / Reward */}
          <div>
            <h4 className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-3">
              Risk / Reward
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-warm-200 bg-white px-3 py-2">
                <div className="text-xs text-warm-500">Total Invested</div>
                <div className="text-sm font-bold text-warm-900">${fmt(rr.totalInvested)}</div>
              </div>
              <div className="rounded-lg border border-warm-200 bg-white px-3 py-2">
                <div className="text-xs text-warm-500">Current Floor</div>
                <div className="text-sm font-bold text-warm-900">${fmt(rr.currentFloor)}</div>
              </div>
              <div className="rounded-lg border border-warm-200 bg-white px-3 py-2">
                <div className="text-xs text-warm-500">Est. Resale (85%)</div>
                <div className="text-sm font-bold text-warm-900">${fmt(rr.estimatedResale)}</div>
              </div>
              <div className="rounded-lg border border-warm-200 bg-white px-3 py-2">
                <div className="text-xs text-warm-500">Projected Upside</div>
                <div
                  className={`text-sm font-bold ${
                    rr.projectedUpside >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {rr.projectedUpside >= 0 ? "+" : ""}
                  {fmt(rr.projectedUpside)}%
                </div>
              </div>
              <div className="rounded-lg border border-warm-200 bg-white px-3 py-2 col-span-2">
                <div className="text-xs text-warm-500">Loss Probability</div>
                <div className="flex items-center gap-2 mt-1">
                  <div
                    className="flex-1 rounded-full overflow-hidden"
                    style={{ height: 8, backgroundColor: "#e7e5e4" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${rr.lossProbability}%`,
                        backgroundColor:
                          rr.lossProbability <= 20
                            ? "#16a34a"
                            : rr.lossProbability <= 50
                            ? "#d97706"
                            : "#dc2626",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <span className="text-sm font-bold text-warm-700">{rr.lossProbability}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function FlareScreener() {
  const [events, setEvents] = useState<FlareEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("flareScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetch("/api/flare")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setEvents(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "eventName" || key === "venue" ? "asc" : "desc");
    }
  };

  const sorted = [...events].sort((a, b) => {
    let aVal: string | number;
    let bVal: string | number;

    switch (sortKey) {
      case "eventName":
        aVal = a.eventName.toLowerCase();
        bVal = b.eventName.toLowerCase();
        break;
      case "venue":
        aVal = a.venue.toLowerCase();
        bVal = b.venue.toLowerCase();
        break;
      case "eventDate":
        aVal = new Date(a.eventDate).getTime();
        bVal = new Date(b.eventDate).getTime();
        break;
      case "projectedUpside":
        aVal = a.riskReward.projectedUpside;
        bVal = b.riskReward.projectedUpside;
        break;
      case "lossProbability":
        aVal = a.riskReward.lossProbability;
        bVal = b.riskReward.lossProbability;
        break;
      case "ticketsAvailable":
        aVal = a.ticketsAvailable ?? -1;
        bVal = b.ticketsAvailable ?? -1;
        break;
      default:
        aVal = a[sortKey] as number;
        bVal = b[sortKey] as number;
    }

    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const SortHeader = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <th
      className="px-4 py-3 font-medium text-warm-500 cursor-pointer select-none hover:text-warm-700 transition-colors"
      onClick={() => handleSort(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === colKey ? (
          <span className="text-amber-500">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>
        ) : (
          <span className="text-warm-300">\u25BC</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-warm-500">Live Ticket Screener</h2>
        <span className="text-xs text-warm-400">
          {events.length} event{events.length !== 1 ? "s" : ""} tracked
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load FLARE scores: {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200 bg-warm-50">
                  {[
                    "Event",
                    "Date",
                    "Venue",
                    "Days Out",
                    "FLARE Score",
                    "Signal",
                    "Held",
                    "Available",
                    "Upside %",
                    "Loss %",
                  ].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-warm-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : events.length === 0 ? (
        <div className="card text-center py-12 text-warm-500">
          No upcoming events tracked. Add events in the Inventory tab.
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200 bg-warm-50">
                  <SortHeader label="Event" colKey="eventName" />
                  <SortHeader label="Date" colKey="eventDate" />
                  <SortHeader label="Venue" colKey="venue" />
                  <SortHeader label="Days Out" colKey="daysOut" />
                  <SortHeader label="FLARE Score" colKey="flareScore" />
                  <SortHeader label="Signal" colKey="signal" />
                  <SortHeader label="Held" colKey="ticketsHeld" />
                  <SortHeader label="Available" colKey="ticketsAvailable" />
                  <SortHeader label="Upside %" colKey="projectedUpside" />
                  <SortHeader label="Loss %" colKey="lossProbability" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((event, i) => {
                  const sig = SIGNAL_CONFIG[event.signal];
                  const isExpanded = expandedId === event.eventId;

                  return (
                    <>
                      <tr
                        key={event.eventId}
                        className={`border-b border-warm-100 hover:bg-warm-50 transition-colors cursor-pointer ${
                          i % 2 === 0 ? "" : "bg-warm-50/40"
                        } ${isExpanded ? "bg-amber-50/40" : ""}`}
                        onClick={() => setExpandedId(isExpanded ? null : event.eventId)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-warm-900 truncate max-w-[200px]">
                            {event.eventName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-warm-600">{fmtDate(event.eventDate)}</td>
                        <td className="px-4 py-3 text-warm-600 truncate max-w-[160px]">
                          {event.venue}
                        </td>
                        <td className="px-4 py-3 text-right text-warm-700">{event.daysOut}d</td>
                        <td className="px-4 py-3" style={{ minWidth: 120 }}>
                          <FlareBar score={event.flareScore} />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${sig.bg} ${sig.text} ${sig.border}`}
                          >
                            {sig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-warm-700">{event.ticketsHeld}</td>
                        <td className="px-4 py-3 text-right text-warm-700">
                          {event.ticketsAvailable ?? "\u2014"}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            event.riskReward.projectedUpside >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {event.riskReward.projectedUpside >= 0 ? "+" : ""}
                          {fmt(event.riskReward.projectedUpside)}%
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            event.riskReward.lossProbability <= 20
                              ? "text-green-600"
                              : event.riskReward.lossProbability <= 50
                              ? "text-amber-600"
                              : "text-red-600"
                          }`}
                        >
                          {event.riskReward.lossProbability}%
                        </td>
                      </tr>
                      {isExpanded && (
                        <BreakdownRow key={`${event.eventId}-detail`} event={event} />
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
