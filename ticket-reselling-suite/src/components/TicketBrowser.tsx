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

interface ScanHistoryEntry {
  eventName: string;
  platform: string;
  url: string;
  getIn: number;
  median: number;
  total: number;
  time: string;
}

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

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function computeStats(listings: CapturedData["listings"]) {
  if (!listings.length) return null;
  const prices = listings.map((l) => l.price).sort((a, b) => a - b);
  const sum = prices.reduce((a, b) => a + b, 0);
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];
  return {
    getIn: prices[0],
    median: Math.round(median * 100) / 100,
    avg: Math.round((sum / prices.length) * 100) / 100,
    max: prices[prices.length - 1],
    total: listings.length,
  };
}

export function TicketBrowser() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<CapturedData | null>(null);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [dataTab, setDataTab] = useState<"live" | "history">("live");
  const [saved, setSaved] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const api = typeof window !== "undefined" ? window.ticketOps : null;

  useEffect(() => {
    if (!api) return;
    api.onUrlChanged((newUrl: string) => {
      setUrl(newUrl);
      setData(null);
      setSaved(false);
    });
    api.onLoadingChanged((isLoading: boolean) => setLoading(isLoading));
  }, [api]);

  // Poll for captured data
  useEffect(() => {
    if (!isOpen || !api) return;
    pollRef.current = setInterval(async () => {
      const result = await api.getData();
      if (result && result.count > 0) {
        setData((prev) => {
          // Auto-add to history when we get new data for a different event
          if (prev && prev.eventName !== result.eventName && prev.count > 0) {
            const stats = computeStats(prev.listings);
            if (stats) {
              setHistory((h) => {
                const exists = h.some((e) => e.url === prev.url);
                if (exists) return h;
                return [
                  {
                    eventName: prev.eventName,
                    platform: prev.platform,
                    url: prev.url,
                    getIn: stats.getIn,
                    median: stats.median,
                    total: stats.total,
                    time: new Date().toLocaleTimeString(),
                  },
                  ...h,
                ].slice(0, 50);
              });
            }
          }
          return result;
        });
        setSaved(false);
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
      setIsOpen(true);
      setData(null);
      setSaved(false);
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
    // Save current data to history before closing
    if (data && data.count > 0) {
      const stats = computeStats(data.listings);
      if (stats) {
        setHistory((h) => {
          const exists = h.some((e) => e.url === data.url);
          if (exists) return h;
          return [
            {
              eventName: data.eventName,
              platform: data.platform,
              url: data.url,
              getIn: stats.getIn,
              median: stats.median,
              total: stats.total,
              time: new Date().toLocaleTimeString(),
            },
            ...h,
          ].slice(0, 50);
        });
      }
    }
    await api.closeBrowser();
    setIsOpen(false);
    setData(null);
    setUrl("");
  }, [api, data]);

  const saveSnapshot = async () => {
    if (!data || data.count === 0) return;
    const stats = computeStats(data.listings);
    if (!stats) return;

    await fetch("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: data.eventName,
        platform: data.platform,
        getInPrice: stats.getIn,
        medianPrice: stats.median,
        averagePrice: stats.avg,
        maxPrice: stats.max,
        totalListings: stats.total,
      }),
    });
    setSaved(true);
  };

  if (!api) {
    return (
      <div className="card text-center py-16 space-y-4">
        <p className="text-2xl">🖥️</p>
        <p className="text-slate-300 font-medium">
          Built-in Browser requires the Desktop App
        </p>
        <p className="text-sm text-slate-500">
          Run with{" "}
          <code className="text-sky-400">npm run electron:dev</code> to enable.
        </p>
      </div>
    );
  }

  const stats = data ? computeStats(data.listings) : null;

  // ─── Landing (no browser open) ─────────────────────────────────────
  if (!isOpen) {
    return (
      <div className="space-y-6">
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

        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-3">
            Browse Ticket Sites
          </h3>
          <div className="grid grid-cols-5 gap-3">
            {QUICK_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => navigate(link.url)}
                className={`${link.color} rounded-lg px-4 py-8 text-center text-white font-semibold hover:opacity-90 transition-opacity text-lg`}
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>

        {/* Show history from previous browsing */}
        {history.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-3">
              Recent Scans
            </h3>
            <div className="space-y-2">
              {history.map((h, i) => (
                <div
                  key={i}
                  className="card flex items-center justify-between cursor-pointer hover:border-sky-500/50 transition-colors"
                  onClick={() => navigate(h.url)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {h.eventName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {h.platform} · {h.total} listings · {h.time}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-green-400 font-semibold">
                      {fmt(h.getIn)}
                    </p>
                    <p className="text-xs text-slate-500">
                      med {fmt(h.median)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {history.length === 0 && (
          <div className="card text-center py-12 text-slate-500">
            <p className="text-lg mb-2">Browse any ticket site above</p>
            <p className="text-sm">
              TicketOps captures pricing data in real-time as you browse.
              <br />
              No extensions needed — it all happens inside this app.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ─── Split-Screen: Browser (left) + Data Panel (right) ─────────────
  return (
    <div className="flex flex-col h-[calc(100vh-112px)]">
      {/* Browser Toolbar */}
      <div className="flex items-center gap-2 bg-slate-900 border-b border-slate-700 px-3 py-2 shrink-0">
        {/* Exit button — prominent red */}
        <button
          onClick={closeBrowser}
          className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors"
          title="Close browser and return to dashboard"
        >
          ✕ Exit
        </button>

        <div className="w-px h-5 bg-slate-700 mx-1" />

        <button
          onClick={() => api.back()}
          className="text-slate-400 hover:text-white px-2 py-1 text-lg"
          title="Back"
        >
          ←
        </button>
        <button
          onClick={() => api.forward()}
          className="text-slate-400 hover:text-white px-2 py-1 text-lg"
          title="Forward"
        >
          →
        </button>
        <button
          onClick={() => api.refresh()}
          className="text-slate-400 hover:text-white px-2 py-1 text-lg"
          title="Refresh"
        >
          ↻
        </button>

        <form onSubmit={handleSubmit} className="flex-1 flex">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
          />
        </form>

        {loading && (
          <span className="text-sky-400 text-xs animate-pulse">
            Loading...
          </span>
        )}
      </div>

      {/* Split: BrowserView (left, rendered by Electron) + Data Panel (right) */}
      <div className="flex flex-1 overflow-hidden">
        {/* BrowserView takes up left side — Electron renders it here */}
        <div className="flex-1 bg-slate-950" />

        {/* Data Panel — always visible on right side */}
        <div className="w-[380px] shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col overflow-hidden">
          {/* Panel tabs */}
          <div className="flex border-b border-slate-700 shrink-0">
            <button
              onClick={() => setDataTab("live")}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                dataTab === "live"
                  ? "text-sky-400 border-b-2 border-sky-400 bg-slate-800/50"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Live Data{" "}
              {data && data.count > 0 && (
                <span className="ml-1 bg-sky-600 text-white px-1.5 py-0.5 rounded-full text-[10px]">
                  {data.count}
                </span>
              )}
            </button>
            <button
              onClick={() => setDataTab("history")}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                dataTab === "history"
                  ? "text-sky-400 border-b-2 border-sky-400 bg-slate-800/50"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              History{" "}
              {history.length > 0 && (
                <span className="ml-1 bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full text-[10px]">
                  {history.length}
                </span>
              )}
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {dataTab === "live" && (
              <>
                {/* No data yet */}
                {(!data || data.count === 0) && (
                  <div className="text-center py-12 text-slate-500">
                    <p className="text-3xl mb-3">📊</p>
                    <p className="text-sm">
                      Browse to an event page
                      <br />
                      Data appears automatically
                    </p>
                  </div>
                )}

                {/* Live data */}
                {data && data.count > 0 && stats && (
                  <>
                    {/* Event header */}
                    <div>
                      <p className="text-sm font-semibold text-slate-200 truncate">
                        {data.eventName}
                      </p>
                      <p className="text-xs text-slate-500">{data.platform}</p>
                    </div>

                    {/* Save button */}
                    <button
                      onClick={saveSnapshot}
                      disabled={saved}
                      className={`w-full text-xs font-medium py-2 rounded transition-colors ${
                        saved
                          ? "bg-green-600/20 text-green-400 cursor-default"
                          : "bg-sky-600 text-white hover:bg-sky-500"
                      }`}
                    >
                      {saved ? "✓ Saved to Database" : "Save Snapshot"}
                    </button>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-slate-800 p-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                          Get-in
                        </p>
                        <p className="text-lg font-bold text-green-400">
                          {fmt(stats.getIn)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-800 p-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                          Median
                        </p>
                        <p className="text-lg font-bold">{fmt(stats.median)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-800 p-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                          Average
                        </p>
                        <p className="text-lg font-bold">{fmt(stats.avg)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-800 p-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                          Listings
                        </p>
                        <p className="text-lg font-bold">{stats.total}</p>
                      </div>
                    </div>

                    {/* Listings table */}
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                        All Listings (sorted by price)
                      </p>
                      <div className="overflow-y-auto max-h-[calc(100vh-520px)]">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-slate-900">
                            <tr className="border-b border-slate-700 text-slate-500">
                              <th className="text-left py-1.5 pr-1">Sec</th>
                              <th className="text-left py-1.5 pr-1">Row</th>
                              <th className="text-right py-1.5 pr-1">Price</th>
                              <th className="text-right py-1.5">Qty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.listings
                              .sort((a, b) => a.price - b.price)
                              .slice(0, 200)
                              .map((l, i) => (
                                <tr
                                  key={i}
                                  className="border-b border-slate-800/50 hover:bg-slate-800/30"
                                >
                                  <td className="py-1 pr-1 truncate max-w-[80px]">
                                    {l.section || "—"}
                                  </td>
                                  <td className="py-1 pr-1">
                                    {l.row || "—"}
                                  </td>
                                  <td className="py-1 pr-1 text-right font-mono">
                                    {i === 0 ? (
                                      <span className="text-green-400 font-semibold">
                                        {fmt(l.price)}
                                      </span>
                                    ) : (
                                      fmt(l.price)
                                    )}
                                  </td>
                                  <td className="py-1 text-right">
                                    {l.quantity}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        {data.count > 200 && (
                          <p className="text-[10px] text-slate-600 text-center mt-1">
                            Showing 200 of {data.count}
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {dataTab === "history" && (
              <>
                {history.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <p className="text-sm">
                      Events you browse will appear here
                    </p>
                  </div>
                )}
                {history.map((h, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-slate-800 p-3 cursor-pointer hover:bg-slate-700/80 transition-colors"
                    onClick={() => navigate(h.url)}
                  >
                    <p className="text-sm font-medium truncate">
                      {h.eventName}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {h.platform} · {h.time}
                    </p>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span>
                        <span className="text-slate-500">Get-in: </span>
                        <span className="text-green-400 font-semibold">
                          {fmt(h.getIn)}
                        </span>
                      </span>
                      <span>
                        <span className="text-slate-500">Med: </span>
                        <span className="font-medium">{fmt(h.median)}</span>
                      </span>
                      <span>
                        <span className="text-slate-500">Listings: </span>
                        <span className="font-medium">{h.total}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
