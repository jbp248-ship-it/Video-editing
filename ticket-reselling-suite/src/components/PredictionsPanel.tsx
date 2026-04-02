"use client";

import { useState, useEffect } from "react";

interface Prediction {
  eventId: string;
  eventName: string;
  currentPrice: number;
  predictedPrice24h: number;
  predictedPrice48h: number;
  predictedPriceEvent: number;
  priceDirection: "UP" | "DOWN" | "STABLE";
  confidence: number;
  selloutProbability: number;
  estimatedSelloutDate: string | null;
  recommendation: "BUY" | "SELL" | "HOLD" | "AVOID";
  reasoning: string;
}

type SortKey = "recommendation" | "confidence" | "selloutProbability";

const DIRECTION_CONFIG = {
  UP: { arrow: "\u25B2", color: "#16a34a", label: "Rising" },
  DOWN: { arrow: "\u25BC", color: "#dc2626", label: "Falling" },
  STABLE: { arrow: "\u25C6", color: "#78716c", label: "Stable" },
};

const RECOMMENDATION_CONFIG = {
  BUY: { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" },
  SELL: { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
  HOLD: { bg: "#f5f5f4", text: "#44403c", border: "#d6d3d1" },
  AVOID: { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" },
};

const RECOMMENDATION_ORDER: Record<string, number> = {
  BUY: 0,
  SELL: 1,
  HOLD: 2,
  AVOID: 3,
};

function fmt(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pctChange(current: number, predicted: number): string {
  if (current === 0) return "+0.0%";
  const pct = ((predicted - current) / current) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function SelloutBadge({ probability }: { probability: number }) {
  let label: string;
  let bg: string;
  let text: string;
  let border: string;

  if (probability > 70) {
    label = "Selling Fast";
    bg = "#fee2e2";
    text = "#991b1b";
    border = "#fecaca";
  } else if (probability >= 30) {
    label = "Moderate Demand";
    bg = "#fef3c7";
    text = "#92400e";
    border = "#fde68a";
  } else {
    label = "Plenty Available";
    bg = "#dcfce7";
    text = "#166534";
    border = "#bbf7d0";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 9999,
        backgroundColor: bg,
        color: text,
        border: `1px solid ${border}`,
      }}
    >
      {probability}% &middot; {label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 70 ? "#16a34a" : value >= 40 ? "#d97706" : "#dc2626";
  const bgColor =
    value >= 70 ? "#dcfce7" : value >= 40 ? "#fef3c7" : "#fee2e2";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 20,
        borderRadius: 6,
        backgroundColor: bgColor,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${value}%`,
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
          fontSize: 11,
          fontWeight: 700,
          color: value >= 50 ? "#fff" : "#1c1917",
        }}
      >
        {value}%
      </span>
    </div>
  );
}

function MiniChart({ prediction }: { prediction: Prediction }) {
  const points = [
    { label: "Now", value: prediction.currentPrice },
    { label: "24h", value: prediction.predictedPrice24h },
    { label: "48h", value: prediction.predictedPrice48h },
    { label: "Event", value: prediction.predictedPriceEvent },
  ];
  const maxVal = Math.max(...points.map((p) => p.value));
  const minVal = Math.min(...points.map((p) => p.value));
  const range = maxVal - minVal || 1;

  return (
    <div style={{ padding: "12px 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          height: 80,
        }}
      >
        {points.map((point) => {
          const heightPct = ((point.value - minVal) / range) * 100;
          const barHeight = Math.max(heightPct * 0.7 + 15, 15);
          const isUp = point.value >= prediction.currentPrice;

          return (
            <div
              key={point.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#78716c",
                }}
              >
                ${fmt(point.value)}
              </span>
              <div
                style={{
                  width: "100%",
                  height: barHeight,
                  borderRadius: 4,
                  backgroundColor: isUp ? "#dcfce7" : "#fee2e2",
                  border: `1px solid ${isUp ? "#bbf7d0" : "#fecaca"}`,
                  transition: "height 0.3s ease",
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  color: "#a8a29e",
                  fontWeight: 500,
                }}
              >
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="card"
      style={{ padding: 20 }}
    >
      <div className="space-y-3">
        <div
          className="rounded bg-warm-200 animate-pulse"
          style={{ height: 18, width: "60%" }}
        />
        <div
          className="rounded bg-warm-200 animate-pulse"
          style={{ height: 14, width: "40%" }}
        />
        <div className="flex gap-3 mt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded bg-warm-200 animate-pulse"
              style={{ height: 40, flex: 1 }}
            />
          ))}
        </div>
        <div
          className="rounded bg-warm-200 animate-pulse"
          style={{ height: 20, width: "80%" }}
        />
      </div>
    </div>
  );
}

export function PredictionsPanel() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("recommendation");

  useEffect(() => {
    fetch("/api/predictions")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setPredictions(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err) => setError(err?.message ?? "Unknown error"))
      .finally(() => setLoading(false));
  }, []);

  const safePredictions = Array.isArray(predictions) ? predictions : [];

  const sorted = [...safePredictions].sort((a, b) => {
    switch (sortKey) {
      case "recommendation": {
        const aOrd = RECOMMENDATION_ORDER[a.recommendation] ?? 99;
        const bOrd = RECOMMENDATION_ORDER[b.recommendation] ?? 99;
        if (aOrd !== bOrd) return aOrd - bOrd;
        return b.confidence - a.confidence;
      }
      case "confidence":
        return b.confidence - a.confidence;
      case "selloutProbability":
        return b.selloutProbability - a.selloutProbability;
      default:
        return 0;
    }
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-medium text-warm-500">
          Price Predictions &amp; Recommendations
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-warm-400">Sort by:</span>
          {(
            [
              { key: "recommendation", label: "Recommendation" },
              { key: "confidence", label: "Confidence" },
              { key: "selloutProbability", label: "Sellout Risk" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortKey(opt.key)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                sortKey === opt.key
                  ? "bg-white text-warm-900 shadow-sm font-medium"
                  : "text-warm-500 hover:text-warm-700"
              }`}
              style={
                sortKey === opt.key
                  ? { border: "1px solid #e7e5e4" }
                  : { border: "1px solid transparent" }
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load predictions: {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : safePredictions.length === 0 && !error ? (
        /* Empty state */
        <div className="card text-center py-12 text-warm-500">
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>
            {"\u2014"}
          </div>
          <p className="text-sm font-medium">No predictions available</p>
          <p className="text-xs text-warm-400 mt-1">
            Predictions will appear once events are being tracked in the Market
            Scanner.
          </p>
        </div>
      ) : (
        /* Prediction cards grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((pred) => {
            const dir = DIRECTION_CONFIG[pred.priceDirection] ?? DIRECTION_CONFIG.STABLE;
            const rec = RECOMMENDATION_CONFIG[pred.recommendation] ?? RECOMMENDATION_CONFIG.HOLD;
            const isExpanded = expandedId === pred.eventId;

            return (
              <div
                key={pred.eventId}
                className="card"
                style={{
                  padding: 0,
                  cursor: "pointer",
                  transition: "box-shadow 0.2s ease, transform 0.15s ease",
                  border: isExpanded ? "1px solid #fde68a" : undefined,
                }}
                onClick={() =>
                  setExpandedId(isExpanded ? null : pred.eventId)
                }
              >
                {/* Card header */}
                <div style={{ padding: "16px 16px 0" }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3
                      className="text-sm font-semibold text-warm-900 truncate"
                      style={{ maxWidth: "70%" }}
                      title={pred.eventName}
                    >
                      {pred.eventName}
                    </h3>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 10px",
                        borderRadius: 9999,
                        backgroundColor: rec.bg,
                        color: rec.text,
                        border: `1px solid ${rec.border}`,
                        flexShrink: 0,
                      }}
                    >
                      {pred.recommendation}
                    </span>
                  </div>

                  {/* Current price + direction */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-bold text-warm-900">
                      ${fmt(pred.currentPrice)}
                    </span>
                    <span
                      style={{
                        color: dir.color,
                        fontSize: 13,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      {dir.arrow} {dir.label}
                    </span>
                  </div>
                </div>

                {/* Price predictions row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 1,
                    backgroundColor: "#e7e5e4",
                  }}
                >
                  {[
                    {
                      label: "24h",
                      price: pred.predictedPrice24h,
                    },
                    {
                      label: "48h",
                      price: pred.predictedPrice48h,
                    },
                    {
                      label: "Event Day",
                      price: pred.predictedPriceEvent,
                    },
                  ].map((col) => {
                    const change = pctChange(pred.currentPrice, col.price);
                    const isUp = col.price >= pred.currentPrice;

                    return (
                      <div
                        key={col.label}
                        style={{
                          backgroundColor: "#FAF9F6",
                          padding: "10px 12px",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: "#a8a29e",
                            fontWeight: 500,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: 2,
                          }}
                        >
                          {col.label}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#1c1917",
                          }}
                        >
                          ${fmt(col.price)}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: isUp ? "#16a34a" : "#dc2626",
                          }}
                        >
                          {change}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Confidence + sellout */}
                <div style={{ padding: "12px 16px" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      style={{
                        fontSize: 11,
                        color: "#78716c",
                        fontWeight: 500,
                      }}
                    >
                      Confidence
                    </span>
                  </div>
                  <ConfidenceBar value={pred.confidence} />

                  <div
                    className="flex items-center justify-between mt-3"
                    style={{ flexWrap: "wrap", gap: 4 }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "#78716c",
                        fontWeight: 500,
                      }}
                    >
                      Sellout Risk
                    </span>
                    <SelloutBadge probability={pred.selloutProbability} />
                  </div>

                  {pred.estimatedSelloutDate && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#a8a29e",
                        marginTop: 4,
                      }}
                    >
                      Est. sellout:{" "}
                      {new Date(pred.estimatedSelloutDate).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" }
                      )}
                    </div>
                  )}
                </div>

                {/* Reasoning */}
                <div
                  style={{
                    padding: "0 16px 12px",
                    fontSize: 12,
                    color: "#78716c",
                    lineHeight: 1.5,
                  }}
                >
                  {pred.reasoning}
                </div>

                {/* Expanded mini-chart */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: "1px solid #e7e5e4",
                      padding: "4px 16px 8px",
                      backgroundColor: "#FAF9F6",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#78716c",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 4,
                        paddingTop: 8,
                      }}
                    >
                      Price Trend Forecast
                    </div>
                    <MiniChart prediction={pred} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
