"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface CapturedData {
  platform: string;
  eventName: string;
  url: string;
  listings: Array<{
    price: number;
    section: string;
    row: string;
    quantity: number;
    priceWithFees: number | null;
  }>;
  count: number;
}

// Type for the Electron IPC bridge
interface TicketOpsAPI {
  navigate: (url: string) => Promise<boolean>;
  back: () => Promise<void>;
  forward: () => Promise<void>;
  refresh: () => Promise<void>;
  closeBrowser: () => Promise<void>;
  getData: () => Promise<CapturedData | null>;
  onUrlChanged: (cb: (url: string) => void) => void;
  onLoadingChanged: (cb: (loading: boolean) => void) => void;
  onTitleChanged: (cb: (title: string) => void) => void;
}

declare global {
  interface Window {
    ticketOps?: TicketOpsAPI;
  }
}

const QUICK_LINKS = [
  { label: "StubHub", url: "https://www.stubhub.com", color: "bg-purple-600" },
  { label: "Ticketmaster", url: "https://www.ticketmaster.com", color: "bg-blue-600" },
  { label: "VividSeats", url: "https://www.vividseats.com", color: "bg-green-600" },
  { label: "SeatGeek", url: "https://seatgeek.com", color: "bg-orange-600" },
  { label: "Etix", url: "https://www.etix.com", color: "bg-red-600" },
];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function TicketBrowser() {
  const [url, setUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<CapturedData | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const api = typeof window !== "undefined" ? window.ticketOps : null;

  // Listen for URL/loading changes from Electron
  useEffect(() => {
    if (!api) return;
    api.onUrlChanged((newUrl: string) => {
      setCurrentUrl(newUrl);
      setUrl(newUrl);
      setData(null); // Clear data on navigation
    });
    api.onLoadingChanged((isLoading: boolean) => setLoading(isLoading));
  }, [api]);

  // Poll for captured data every 2 seconds while browser is open
  useEffect(() => {
    if (!isOpen || !api) return;
    pollRef.current = setInterval(async () => {
      const result = await api.getData();
      if (result && result.count > 0) {
        setData(result);
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isOpen, api]);

  const navigate = useCallback(
    async (targetUrl: string) => {
      if (!api) return;
      let finalUrl = targetUrl;
      if (!finalUrl.startsWith("http")) finalUrl = "https://" + finalUrl;
      setUrl(finalUrl);
      setCurrentUrl(finalUrl);
      setIsOpen(true);
      setData(null);
      await api.navigate(finalUrl);
    },
    [api]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) navigate(url.trim());
  };

  const closeBrowser = useCallback(async () => {
    if (!api) return;
    await api.closeBrowser();
    setIsOpen(false);
    setData(null);
    setCurrentUrl("");
  }, [api]);

  // Save snapshot to DB
  const saveSnapshot = async () => {
    if (!data || data.count === 0) return;
    const prices = data.listings.map((l) => l.price).sort((a, b) => a - b);
    const sum = prices.reduce((a, b) => a + b, 0);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

    await fetch("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: data.eventName,
        platform: data.platform,
        getInPrice: prices[0],
        medianPrice: Math.round(median * 100) / 100,
        averagePrice: Math.round((sum / prices.length) * 100) / 100,
        maxPrice: prices[prices.length - 1],
        totalListings: data.count,
      }),
    });
  };

  if (!api) {
    return (
      <div className="card text-center py-16 space-y-4">
        <p className="text-2xl">🖥️</p>
        <p className="text-slate-300 font-medium">
          Built-in Browser requires the Desktop App
        </p>
        <p className="text-sm text-slate-500">
          Run the app with <code className="text-sky-400">npm run electron:dev</code> to
          enable the embedded browser for live ticket scanning.
        </p>
      </div>
    );
  }

  // Not browsing yet — show landing with quick links
  if (!isOpen) {
    return (
      <div className="space-y-6">
        {/* URL Bar */}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a ticket URL or search..."
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <button type="submit" className="btn-primary px-6">
            Go
          </button>
        </form>

        {/* Quick Links */}
        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-3">
            Browse Ticket Sites
          </h3>
          <div className="grid grid-cols-5 gap-3">
            {QUICK_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => navigate(link.url)}
                className={`${link.color} rounded-lg px-4 py-6 text-center text-white font-semibold hover:opacity-90 transition-opacity`}
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card text-center py-12 text-slate-500">
          <p className="text-lg mb-2">Browse any ticket site above</p>
          <p className="text-sm">
            TicketOps captures pricing data in real-time as you browse.
            <br />
            No extensions needed — it all happens inside this app.
          </p>
        </div>
      </div>
    );
  }

  // Browser is open — show toolbar + data panel
  const stats = data
    ? (() => {
        const prices = data.listings.map((l) => l.price).sort((a, b) => a - b);
        const sum = prices.reduce((a, b) => a + b, 0);
        const mid = Math.floor(prices.length / 2);
        return {
          getIn: prices[0],
          median: prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid],
          avg: sum / prices.length,
          max: prices[prices.length - 1],
          total: data.count,
        };
      })()
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-112px)]">
      {/* Browser Toolbar */}
      <div className="flex items-center gap-2 bg-slate-900 border-b border-slate-700 px-3 py-2 shrink-0">
        <button onClick={() => api.back()} className="text-slate-400 hover:text-white px-2 py-1" title="Back">
          ←
        </button>
        <button onClick={() => api.forward()} className="text-slate-400 hover:text-white px-2 py-1" title="Forward">
          →
        </button>
        <button onClick={() => api.refresh()} className="text-slate-400 hover:text-white px-2 py-1" title="Refresh">
          ↻
        </button>

        <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
          />
        </form>

        {loading && (
          <span className="text-sky-400 text-xs animate-pulse">Loading...</span>
        )}

        <button
          onClick={() => setShowPanel(!showPanel)}
          className={`text-xs px-3 py-1.5 rounded ${
            showPanel ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-300"
          }`}
        >
          {data ? `📊 ${data.count} listings` : "📊 Data"}
        </button>

        <button onClick={closeBrowser} className="text-slate-400 hover:text-red-400 px-2 py-1" title="Close browser">
          ✕
        </button>
      </div>

      {/* Data Panel (slides in from right) */}
      {showPanel && data && data.count > 0 && (
        <div className="absolute right-0 top-16 w-96 h-[calc(100vh-112px)] bg-slate-900 border-l border-slate-700 z-40 overflow-y-auto p-4 space-y-4">
          {/* Stats */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-sky-400">
              Live Market Data
            </h3>
            <button
              onClick={saveSnapshot}
              className="text-xs bg-sky-600 text-white px-3 py-1 rounded hover:bg-sky-500"
            >
              Save Snapshot
            </button>
          </div>

          <div className="text-xs text-slate-400 truncate">
            {data.eventName} — {data.platform}
          </div>

          {stats && (
            <div className="grid grid-cols-2 gap-2">
              <div className="stat-card">
                <span className="stat-label">Get-in</span>
                <span className="stat-value text-lg text-green-400">
                  {formatCurrency(stats.getIn)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Median</span>
                <span className="stat-value text-lg">
                  {formatCurrency(stats.median)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Average</span>
                <span className="stat-value text-lg">
                  {formatCurrency(stats.avg)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Listings</span>
                <span className="stat-value text-lg">{stats.total}</span>
              </div>
            </div>
          )}

          {/* Listings Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="text-left py-2 pr-2">Section</th>
                  <th className="text-left py-2 pr-2">Row</th>
                  <th className="text-right py-2 pr-2">Price</th>
                  <th className="text-right py-2">Qty</th>
                </tr>
              </thead>
              <tbody>
                {data.listings
                  .sort((a, b) => a.price - b.price)
                  .slice(0, 100)
                  .map((l, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-800 hover:bg-slate-800/50"
                    >
                      <td className="py-1.5 pr-2">{l.section || "—"}</td>
                      <td className="py-1.5 pr-2">{l.row || "—"}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">
                        {i === 0 ? (
                          <span className="text-green-400">
                            {formatCurrency(l.price)}
                          </span>
                        ) : (
                          formatCurrency(l.price)
                        )}
                      </td>
                      <td className="py-1.5 text-right">{l.quantity}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {data.count > 100 && (
              <p className="text-xs text-slate-500 mt-2 text-center">
                Showing 100 of {data.count} listings
              </p>
            )}
          </div>
        </div>
      )}

      {/* The BrowserView occupies the space below the toolbar */}
      {/* It's rendered by Electron, not React — this is just a placeholder */}
      <div className="flex-1 bg-slate-950 flex items-center justify-center text-slate-600">
        {!data && !loading && (
          <p className="text-sm">Page is loading in the embedded browser above...</p>
        )}
      </div>
    </div>
  );
}
