"use client";

// Recharts-based price trend visualization.
// Renders a line chart showing get-in price and listing volume over time.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Bar,
  ComposedChart,
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

export function PriceTrendChart({
  data,
  title = "Price Trend",
}: PriceTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="card text-center py-8 text-slate-400">
        No market data yet. Use the Chrome extension to capture snapshots.
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
      <h3 className="text-sm font-medium text-slate-400 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="time"
            tickFormatter={formatTick}
            stroke="#64748b"
            fontSize={11}
          />
          <YAxis
            yAxisId="price"
            stroke="#64748b"
            fontSize={11}
            tickFormatter={(v: number) => `$${v}`}
          />
          <YAxis
            yAxisId="volume"
            orientation="right"
            stroke="#64748b"
            fontSize={11}
          />
          <Tooltip
            contentStyle={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Bar
            yAxisId="volume"
            dataKey="listings"
            fill="#0ea5e933"
            name="Listings"
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="getIn"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={false}
            name="Get-In Price"
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="median"
            stroke="#a78bfa"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            name="Median Price"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
