"use client";

import { useState, useEffect } from "react";

interface VelocityEvent {
  eventId: string;
  eventName: string;
  venue: string;
  eventDate: string;
  daysToEvent: number;
  currentListings: number;
  velocityPerDay: number;
  daysToSellout: number | null;
  demandLevel: "HIGH" | "MEDIUM" | "LOW";
  ticketsHeld: number;
  currentFloor: number;
  priceChange: number;
  timeline: Array<{ date: string; listings: number; getInPrice: number; medianPrice: number | null }>;
}

const DEMAND_COLORS = { HIGH: "#16a34a", MEDIUM: "#D97706", LOW: "#dc2626" };
const DEMAND_LABELS = { HIGH: "High Demand", MEDIUM: "Moderate", LOW: "Low Demand" };

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function VelocityChart() {
  const [data, setData] = useState<VelocityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/velocity")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(Array.isArray(d) ? d : []))
      .catch((err) => setError(err?.message ?? "Unknown error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card animate-pulse h-20" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border border-red-200 bg-red-50 text-red-700 text-sm p-4">
        Failed to load velocity data: {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-warm-400 text-sm">No events with enough snapshot data to show velocity.</div>
        <div className="text-warm-300 text-xs mt-1">Scan events in the Market Scanner to build up data.</div>
      </div>
    );
  }

  const maxVelocity = Math.max(...data.map((d) => d?.velocityPerDay ?? 0), 1);

  return (
    <div className="space-y-3">
      {/* Header summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-3">
          <div className="text-xs text-warm-500">High Demand Events</div>
          <div className="text-2xl font-bold text-green-600">{data.filter((d) => d.demandLevel === "HIGH").length}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-warm-500">Avg Sell Velocity</div>
          <div className="text-2xl font-bold" style={{ color: "#D97706" }}>
            {(data.length > 0 ? data.reduce((s, d) => s + (d?.velocityPerDay ?? 0), 0) / data.length : 0).toFixed(1)}/day
          </div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-warm-500">Events Near Sellout</div>
          <div className="text-2xl font-bold text-red-600">
            {data.filter((d) => d.daysToSellout !== null && d.daysToSellout < d.daysToEvent).length}
          </div>
        </div>
      </div>

      {/* Event rows */}
      {data.map((event) => {
        const barW = (event.velocityPerDay / maxVelocity) * 100;
        const isExpanded = expanded === event.eventId;

        return (
          <div key={event.eventId} className="card p-0 overflow-hidden">
            <button
              className="w-full text-left p-4 hover:bg-warm-50 transition-colors"
              onClick={() => setExpanded(isExpanded ? null : event.eventId)}
            >
              <div className="flex items-center gap-4">
                {/* Demand badge */}
                <div
                  className="w-2 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: DEMAND_COLORS[event.demandLevel] }}
                />

                {/* Event info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-warm-800 truncate">{event.eventName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                      backgroundColor: DEMAND_COLORS[event.demandLevel] + "18",
                      color: DEMAND_COLORS[event.demandLevel],
                    }}>
                      {DEMAND_LABELS[event.demandLevel]}
                    </span>
                  </div>

                  {/* Velocity bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-warm-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${barW}%`, backgroundColor: DEMAND_COLORS[event.demandLevel] }}
                      />
                    </div>
                    <span className="text-xs font-mono text-warm-600 w-16 text-right">
                      {event.velocityPerDay}/day
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-warm-500">
                    <span>{event.daysToEvent}d to event</span>
                    <span>{event.currentListings} listings</span>
                    <span>Floor: {fmt(event.currentFloor)}</span>
                    <span style={{ color: event.priceChange >= 0 ? "#16a34a" : "#dc2626" }}>
                      {event.priceChange >= 0 ? "+" : ""}{event.priceChange}%
                    </span>
                    {event.daysToSellout !== null && (
                      <span style={{ color: event.daysToSellout < event.daysToEvent ? "#16a34a" : "#dc2626" }}>
                        ~{event.daysToSellout}d to sellout
                      </span>
                    )}
                    {event.ticketsHeld > 0 && (
                      <span className="font-medium text-warm-700">You hold: {event.ticketsHeld}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>

            {/* Expanded: mini timeline chart */}
            {isExpanded && Array.isArray(event?.timeline) && event.timeline.length > 0 && (
              <div className="border-t border-warm-100 p-4 bg-warm-50/50">
                <div className="text-xs text-warm-500 mb-2">Listing count over time</div>
                <div className="flex items-end gap-px h-24">
                  {event.timeline.map((point, i) => {
                    const maxListings = Math.max(...event.timeline.map((t) => t?.listings ?? 0), 1);
                    const h = ((point?.listings ?? 0) / maxListings) * 80;
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-t"
                        style={{
                          height: `${h}px`,
                          backgroundColor: "#D97706",
                          opacity: 0.3 + (i / event.timeline.length) * 0.7,
                        }}
                        title={`${new Date(point?.date ?? 0).toLocaleDateString()}: ${point?.listings ?? 0} listings, Floor: ${fmt(point?.getInPrice ?? 0)}`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-warm-400 mt-1">
                  <span>{new Date(event.timeline[0]?.date ?? 0).toLocaleDateString()}</span>
                  <span>{new Date(event.timeline[event.timeline.length - 1]?.date ?? 0).toLocaleDateString()}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
