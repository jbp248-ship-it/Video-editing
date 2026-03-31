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
  setSidebarWidth: (w: number) => Promise<void>;
  onUrlChanged: (cb: (url: string) => void) => () => void;
  onLoadingChanged: (cb: (loading: boolean) => void) => () => void;
  onBrowserClosed: (cb: () => void) => () => void;
}

declare global {
  interface Window {
    ticketOps?: TicketOpsAPI;
  }
}

const QUICK_LINKS = [
  { label: "StubHub", url: "https://www.stubhub.com", color: "#7C3AED" },
  { label: "Ticketmaster", url: "https://www.ticketmaster.com", color: "#2563EB" },
  { label: "VividSeats", url: "https://www.vividseats.com", color: "#059669" },
  { label: "SeatGeek", url: "https://seatgeek.com", color: "#EA580C" },
  { label: "Etix", url: "https://www.etix.com", color: "#DC2626" },
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
    prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
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
  const api = typeof window !== "undefined" ? window.ticketOps : null;

  // Listen for URL/loading changes — with cleanup
  useEffect(() => {
    if (!api) return;
    const unsubUrl = api.onUrlChanged((newUrl: string) => {
      setUrl(newUrl);
      setData(null);
      setSaved(false);
    });
    const unsubLoading = api.onLoadingChanged((isLoading: boolean) =>
      setLoading(isLoading)
    );
    const unsubClosed = api.onBrowserClosed(() => {
      setIsOpen(false);
      setData(null);
      setUrl("");
    });
    return () => {
      unsubUrl();
      unsubLoading();
      unsubClosed();
    };
  }, [api]);

  // Poll for captured data — recursive setTimeout
  const pollingRef = useRef(false);
  useEffect(() => {
    if (!isOpen || !api) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled || pollingRef.current) return;
      pollingRef.current = true;
      try {
        const result = await api.getData();
        if (cancelled) return;
        if (result && result.count > 0) {
          setData((prev) => {
            if (prev && prev.eventName !== result.eventName && prev.count > 0) {
              const s = computeStats(prev.listings);
              if (s) {
                setHistory((h) => {
                  if (h.some((e) => e.url === prev.url)) return h;
                  return [
                    {
                      eventName: prev.eventName,
                      platform: prev.platform,
                      url: prev.url,
                      getIn: s.getIn,
                      median: s.median,
                      total: s.total,
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
      } finally {
        pollingRef.current = false;
        if (!cancelled) setTimeout(poll, 2000);
      }
    };

    setTimeout(poll, 1000);
    return () => {
      cancelled = true;
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
    if (data && data.count > 0) {
      const s = computeStats(data.listings);
      if (s) {
        setHistory((h) => {
          if (h.some((e) => e.url === data.url)) return h;
          return [
            {
              eventName: data.eventName,
              platform: data.platform,
              url: data.url,
              getIn: s.getIn,
              median: s.median,
              total: s.total,
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
        <p className="font-medium" style={{ color: "#2D2B28" }}>
          Built-in Browser requires the Desktop App
        </p>
        <p className="text-sm" style={{ color: "#8C8680" }}>
          Run with{" "}
          <code style={{ color: "#D97706" }}>npm run electron:dev</code> to
          enable.
        </p>
      </div>
    );
  }

  const stats = data ? computeStats(data.listings) : null;

  // ─── Landing ─────────────────────────────────────────────────────────
  if (!isOpen) {
    return (
      <div className="space-y-6">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a ticket URL or search..."
            className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2"
            style={{
              border: "1px solid #E8E2DB",
              backgroundColor: "#FFFFFF",
              color: "#2D2B28",
              focusRingColor: "#D97706",
            }}
          />
          <button type="submit" className="btn-primary px-6 rounded-xl">
            Go
          </button>
        </form>

        <div>
          <h3 className="text-sm font-medium mb-3" style={{ color: "#8C8680" }}>
            Browse Ticket Sites
          </h3>
          <div className="grid grid-cols-5 gap-3">
            {QUICK_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => navigate(link.url)}
                className="rounded-xl px-4 py-8 text-center text-white font-semibold text-lg transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
                style={{ backgroundColor: link.color }}
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>

        {history.length > 0 && (
          <div>
            <h3
              className="text-sm font-medium mb-3"
              style={{ color: "#8C8680" }}
            >
              Recent Scans
            </h3>
            <div className="space-y-2">
              {history.map((h, i) => (
                <div
                  key={i}
                  className="card flex items-center justify-between cursor-pointer transition-all hover:shadow-md"
                  onClick={() => navigate(h.url)}
                >
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "#2D2B28" }}
                    >
                      {h.eventName}
                    </p>
                    <p className="text-xs" style={{ color: "#8C8680" }}>
                      {h.platform} · {h.total} listings · {h.time}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="font-semibold" style={{ color: "#059669" }}>
                      {fmt(h.getIn)}
                    </p>
                    <p className="text-xs" style={{ color: "#8C8680" }}>
                      med {fmt(h.median)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {history.length === 0 && (
          <div
            className="card text-center py-12"
            style={{ color: "#8C8680" }}
          >
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

  // ─── Split-Screen ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-112px)]">
      {/* Browser Toolbar — always visible above BrowserView */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 shrink-0"
        style={{
          backgroundColor: "#3D3929",
          borderBottom: "1px solid #4A4539",
          minHeight: "52px",
          zIndex: 9999,
          position: "relative",
        }}
      >
        {/* EXIT — large, always visible, impossible to miss */}
        <button
          onClick={closeBrowser}
          className="text-white font-bold px-5 py-2.5 rounded-lg transition-all hover:scale-105 active:scale-95 shadow-lg"
          style={{ backgroundColor: "#DC2626", fontSize: "14px" }}
          title="Close browser and return to dashboard (or press Escape)"
        >
          ← Exit Browser
        </button>

        <div
          className="w-px h-6 mx-1"
          style={{ backgroundColor: "#4A4539" }}
        />

        <button
          onClick={() => api.back()}
          className="text-lg px-2 py-1 rounded transition-colors"
          style={{ color: "#A89F91" }}
          title="Back"
        >
          ←
        </button>
        <button
          onClick={() => api.forward()}
          className="text-lg px-2 py-1 rounded transition-colors"
          style={{ color: "#A89F91" }}
          title="Forward"
        >
          →
        </button>
        <button
          onClick={() => api.refresh()}
          className="text-lg px-2 py-1 rounded transition-colors"
          style={{ color: "#A89F91" }}
          title="Refresh"
        >
          ↻
        </button>

        <form onSubmit={handleSubmit} className="flex-1 flex">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
            style={{
              border: "1px solid #4A4539",
              backgroundColor: "#2D2B28",
              color: "#F5F0EB",
            }}
          />
        </form>

        {loading && (
          <span className="text-xs animate-pulse" style={{ color: "#F59E0B" }}>
            Loading...
          </span>
        )}

        <span className="text-[10px]" style={{ color: "#6B6458" }}>
          Press Esc to exit
        </span>
      </div>

      {/* Split: BrowserView (left) + Data Panel (right) */}
      <div className="flex flex-1 overflow-hidden">
        {/* BrowserView placeholder — Electron renders the real browser here */}
        <div className="flex-1" style={{ backgroundColor: "#F5F0EB" }} />

        {/* Data Panel */}
        <div
          className="w-[380px] shrink-0 flex flex-col overflow-hidden"
          style={{
            borderLeft: "1px solid #E8E2DB",
            backgroundColor: "#FFFFFF",
          }}
        >
          {/* Panel tabs */}
          <div
            className="flex shrink-0"
            style={{ borderBottom: "1px solid #E8E2DB" }}
          >
            <button
              onClick={() => setDataTab("live")}
              className="flex-1 py-2.5 text-xs font-medium transition-colors"
              style={{
                color: dataTab === "live" ? "#D97706" : "#8C8680",
                borderBottom:
                  dataTab === "live" ? "2px solid #D97706" : "2px solid transparent",
                backgroundColor:
                  dataTab === "live" ? "rgba(217, 119, 6, 0.05)" : "transparent",
              }}
            >
              Live Data{" "}
              {data && data.count > 0 && (
                <span
                  className="ml-1 text-white px-1.5 py-0.5 rounded-full text-[10px]"
                  style={{ backgroundColor: "#D97706" }}
                >
                  {data.count}
                </span>
              )}
            </button>
            <button
              onClick={() => setDataTab("history")}
              className="flex-1 py-2.5 text-xs font-medium transition-colors"
              style={{
                color: dataTab === "history" ? "#D97706" : "#8C8680",
                borderBottom:
                  dataTab === "history" ? "2px solid #D97706" : "2px solid transparent",
                backgroundColor:
                  dataTab === "history"
                    ? "rgba(217, 119, 6, 0.05)"
                    : "transparent",
              }}
            >
              History{" "}
              {history.length > 0 && (
                <span
                  className="ml-1 px-1.5 py-0.5 rounded-full text-[10px]"
                  style={{
                    backgroundColor: "#E8E2DB",
                    color: "#4A4845",
                  }}
                >
                  {history.length}
                </span>
              )}
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {dataTab === "live" && (
              <>
                {(!data || data.count === 0) && (
                  <div
                    className="text-center py-12"
                    style={{ color: "#8C8680" }}
                  >
                    <p className="text-3xl mb-3">📊</p>
                    <p className="text-sm">
                      Browse to an event page
                      <br />
                      Data appears automatically
                    </p>
                  </div>
                )}

                {data && data.count > 0 && stats && (
                  <>
                    <div>
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: "#2D2B28" }}
                      >
                        {data.eventName}
                      </p>
                      <p className="text-xs" style={{ color: "#8C8680" }}>
                        {data.platform}
                      </p>
                    </div>

                    <button
                      onClick={saveSnapshot}
                      disabled={saved}
                      className="w-full text-xs font-medium py-2 rounded-lg transition-all"
                      style={{
                        backgroundColor: saved ? "rgba(5, 150, 105, 0.1)" : "#D97706",
                        color: saved ? "#059669" : "#FFFFFF",
                        cursor: saved ? "default" : "pointer",
                      }}
                    >
                      {saved ? "✓ Saved to Database" : "Save Snapshot"}
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Get-in", value: fmt(stats.getIn), accent: true },
                        { label: "Median", value: fmt(stats.median) },
                        { label: "Average", value: fmt(stats.avg) },
                        { label: "Listings", value: String(stats.total) },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-lg p-3"
                          style={{ backgroundColor: "#FAF9F6" }}
                        >
                          <p
                            className="text-[10px] uppercase tracking-wider"
                            style={{ color: "#8C8680" }}
                          >
                            {s.label}
                          </p>
                          <p
                            className="text-lg font-bold"
                            style={{ color: s.accent ? "#059669" : "#2D2B28" }}
                          >
                            {s.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div>
                      <p
                        className="text-[10px] uppercase tracking-wider mb-2"
                        style={{ color: "#8C8680" }}
                      >
                        All Listings (sorted by price)
                      </p>
                      <div className="overflow-y-auto max-h-[calc(100vh-520px)]">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0" style={{ backgroundColor: "#FFFFFF" }}>
                            <tr
                              style={{
                                borderBottom: "1px solid #E8E2DB",
                                color: "#8C8680",
                              }}
                            >
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
                                  className="transition-colors"
                                  style={{
                                    borderBottom: "1px solid #F5F0EB",
                                  }}
                                >
                                  <td className="py-1.5 pr-1 truncate max-w-[80px]">
                                    {l.section || "—"}
                                  </td>
                                  <td className="py-1.5 pr-1">{l.row || "—"}</td>
                                  <td className="py-1.5 pr-1 text-right font-mono">
                                    {i === 0 ? (
                                      <span
                                        className="font-semibold"
                                        style={{ color: "#059669" }}
                                      >
                                        {fmt(l.price)}
                                      </span>
                                    ) : (
                                      <span style={{ color: "#2D2B28" }}>
                                        {fmt(l.price)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 text-right">{l.quantity}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        {data.count > 200 && (
                          <p
                            className="text-[10px] text-center mt-1"
                            style={{ color: "#8C8680" }}
                          >
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
                  <div
                    className="text-center py-12 text-sm"
                    style={{ color: "#8C8680" }}
                  >
                    Events you browse will appear here
                  </div>
                )}
                {history.map((h, i) => (
                  <div
                    key={i}
                    className="rounded-lg p-3 cursor-pointer transition-all hover:shadow-sm"
                    style={{ backgroundColor: "#FAF9F6" }}
                    onClick={() => navigate(h.url)}
                  >
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "#2D2B28" }}
                    >
                      {h.eventName}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#8C8680" }}>
                      {h.platform} · {h.time}
                    </p>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span>
                        <span style={{ color: "#8C8680" }}>Get-in: </span>
                        <span
                          className="font-semibold"
                          style={{ color: "#059669" }}
                        >
                          {fmt(h.getIn)}
                        </span>
                      </span>
                      <span>
                        <span style={{ color: "#8C8680" }}>Med: </span>
                        <span className="font-medium">{fmt(h.median)}</span>
                      </span>
                      <span>
                        <span style={{ color: "#8C8680" }}>Listings: </span>
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
