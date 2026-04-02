"use client";

// Recharts-based price trend visualization.
// Renders a line chart showing get-in price and listing volume over time.

import {
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Bar,
  ComposedChart,
  Area,
} from "recharts";

interface DataPoint {
  capturedAt: string;
  getInPrice: number | string;
  medianPrice?: number | string | null;
  totalListings: number;
}

interface PriceTrendChartProps {
  data: DataPoint[];
  title?: string;
}

function formatTick(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatPrice(v: number): string {
  return `$${v.toLocaleString("en-US")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border p-3 text-xs space-y-1"
      style={{
        background: "#FFFFFF",
        border: "1px solid #E8E2DB",
        boxShadow: "0 4px 16px rgba(45,43,40,0.1)",
        color: "#2D2B28",
        minWidth: "140px",
      }}
    >
      <p className="font-semibold text-warm-500 mb-1.5">
        {formatTick(label)}
      </p>
      {payload.map(
        (entry: { name: string; value: number | null; color: string }, i: number) =>
          entry.value != null && (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span style={{ color: "#8C8680" }}>{entry.name}</span>
              </div>
              <span className="font-semibold tabular-nums">
                {entry.name === "Listings"
                  ? entry.value.toLocaleString()
                  : formatPrice(entry.value)}
              </span>
            </div>
          )
      )}
    </div>
  );
}

export function PriceTrendChart({
  data,
  title = "Price Trend",
}: PriceTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="card">
        <p className="section-label mb-4">{title}</p>
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(217,119,6,0.08)" }}
          >
            <svg
              className="h-6 w-6"
              style={{ color: "#D97706" }}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-warm-700">No market data yet</p>
          <p className="text-xs text-warm-400 max-w-xs">
            Use the Chrome extension to capture pricing snapshots. Data will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    time: d.capturedAt,
    getIn: Number(d.getInPrice),
    median: d.medianPrice ? Number(d.medianPrice) : null,
    listings: d.totalListings,
  }));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <p className="section-title">{title}</p>
        <div className="flex items-center gap-4 text-xs" style={{ color: "#8C8680" }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#D97706" }} />
            Get-in
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-px w-5"
              style={{
                backgroundColor: "#8C8680",
                borderTop: "2px dashed #8C8680",
                display: "inline-block",
              }}
            />
            Median
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: "rgba(217,119,6,0.2)" }}
            />
            Listings
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="amberFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#D97706" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E8E2DB" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={formatTick}
            stroke="#C4BBB0"
            tick={{ fill: "#8C8680", fontSize: 11 }}
            axisLine={{ stroke: "#E8E2DB" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="price"
            stroke="transparent"
            tick={{ fill: "#8C8680", fontSize: 11 }}
            tickFormatter={formatPrice}
            axisLine={false}
            tickLine={false}
            width={55}
          />
          <YAxis
            yAxisId="volume"
            orientation="right"
            stroke="transparent"
            tick={{ fill: "#8C8680", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            yAxisId="volume"
            dataKey="listings"
            fill="rgba(217, 119, 6, 0.18)"
            name="Listings"
            radius={[3, 3, 0, 0]}
          />
          <Area
            yAxisId="price"
            type="monotone"
            dataKey="getIn"
            stroke="#D97706"
            strokeWidth={2.5}
            fill="url(#amberFill)"
            dot={false}
            activeDot={{ r: 4, fill: "#D97706", stroke: "#FFFFFF", strokeWidth: 2 }}
            name="Get-In Price"
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="median"
            stroke="#A89F91"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 3, fill: "#A89F91", stroke: "#FFFFFF", strokeWidth: 2 }}
            name="Median Price"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
