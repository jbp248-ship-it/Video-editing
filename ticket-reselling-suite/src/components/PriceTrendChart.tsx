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
      <div className="card text-center py-8 text-warm-500">
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
      <h3 className="text-sm font-medium text-warm-500 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E8E2DB" />
          <XAxis
            dataKey="time"
            tickFormatter={formatTick}
            stroke="#8C8680"
            fontSize={11}
          />
          <YAxis
            yAxisId="price"
            stroke="#8C8680"
            fontSize={11}
            tickFormatter={(v: number) => `$${v}`}
          />
          <YAxis
            yAxisId="volume"
            orientation="right"
            stroke="#8C8680"
            fontSize={11}
          />
          <Tooltip
            contentStyle={{
              background: "#FFFFFF",
              border: "1px solid #E8E2DB",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#2D2B28",
              boxShadow: "0 4px 12px rgba(45, 43, 40, 0.08)",
            }}
          />
          <Bar
            yAxisId="volume"
            dataKey="listings"
            fill="rgba(217, 119, 6, 0.15)"
            name="Listings"
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="getIn"
            stroke="#D97706"
            strokeWidth={2}
            dot={false}
            name="Get-In Price"
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="median"
            stroke="#8C8680"
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
