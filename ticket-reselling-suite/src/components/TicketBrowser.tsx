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
  setBrowserDataPanelWidth: (width: number) => Promise<void>;
  setBrowserTopOffset: (offset: number) => Promise<void>;
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
  { label: "AXS", url: "https://www.axs.com", color: "#0EA5E9" },
  { label: "TickPick", url: "https://www.tickpick.com", color: "#8B5CF6" },
  { label: "Gametime", url: "https://gametime.co", color: "#10B981" },
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

// Shared icon button style for the browser toolbar
function ToolbarIconBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-md transition-all duration-100"
      style={{ color: "#A89F91" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(245,240,235,0.12)";
        e.currentTarget.style.color = "#F5F0EB";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = "#A89F91";
      }}
    >
      {children}
    </button>
  );
}

export function TicketBrowser() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<CapturedData | null>(null);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [dataTab, setDataTab] = useState<"live" | "history">("live");
  const [saved, setSaved] = useState(false);
  const [panelWidth, setPanelWidth] = useState(380);
  const isDraggingRef = useRef(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const api = typeof window !== "undefined" ? window.ticketOps : null;

  // Sync toolbar height to main process as top offset
  useEffect(() => {
    if (!api || !toolbarRef.current || !isOpen) return;
    const el = toolbarRef.current;
    const sync = () => {
      const rect = el.getBoundingClientRect();
      // Total offset = toolbar bottom position relative to the window content area
      api.setBrowserTopOffset?.(Math.round(rect.bottom));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [api, isOpen]);

  // Draggable resize handle for data panel
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX = e.clientX;
      const startWidth = panelWidth;

      const onMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = startX - ev.clientX;
        const newWidth = Math.max(200, Math.min(600, startWidth + delta));
        setPanelWidth(newWidth);
        api?.setBrowserDataPanelWidth?.(newWidth);
      };

      const onUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [panelWidth, api]
  );

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
      <div className="empty-state py-20">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "rgba(217,119,6,0.08)" }}
        >
          <svg
            className="h-7 w-7"
            style={{ color: "#D97706" }}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="empty-state-title">Built-in Browser requires the Desktop App</p>
        <p className="empty-state-body">
          Run with{" "}
          <code
            className="rounded px-1.5 py-0.5 text-xs font-mono"
            style={{ backgroundColor: "rgba(217,119,6,0.1)", color: "#D97706" }}
          >
            npm run electron:dev
          </code>{" "}
          to enable the embedded browser and live data capture.
        </p>
      </div>
    );
  }

  const stats = data ? computeStats(data.listings) : null;

  // ─── Landing ─────────────────────────────────────────────────────────
  if (!isOpen) {
    return (
      <div className="space-y-6">
        {/* URL bar */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <div
              className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center"
              style={{ color: "#A89F91" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter URL or search..."
              className="w-full rounded-xl py-3 pl-10 pr-4 text-sm transition-all duration-150"
              style={{
                border: "1px solid #E8E2DB",
                backgroundColor: "#FFFFFF",
                color: "#2D2B28",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#D97706";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(217,119,6,0.12)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#E8E2DB";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
          <button type="submit" className="btn-primary px-5 rounded-xl">
            Go
          </button>
        </form>

        {/* Quick links */}
        <div>
          <h3 className="section-label block mb-3">Browse Ticket Sites</h3>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => navigate(link.url)}
                className="rounded-lg px-4 py-2.5 text-center font-semibold text-sm text-white transition-all duration-150 hover:scale-[1.03] hover:shadow-lg active:scale-[0.97]"
                style={{ backgroundColor: link.color }}
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent scans */}
        {history.length > 0 && (
          <div>
            <h3 className="section-label block mb-3">Recent Scans</h3>
            <div className="space-y-2">
              {history.map((h, i) => (
                <div
                  key={i}
                  className="card flex items-center justify-between gap-4 cursor-pointer transition-all duration-150 hover:shadow-warm-md"
                  onClick={() => navigate(h.url)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate text-warm-900">
                      {h.eventName}
                    </p>
                    <p className="text-xs text-warm-400 mt-0.5">
                      {h.platform} &middot; {h.total.toLocaleString()} listings &middot; {h.time}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm" style={{ color: "#059669" }}>
                      {fmt(h.getIn)}
                    </p>
                    <p className="text-xs text-warm-400">
                      med {fmt(h.median)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {history.length === 0 && (
          <div className="card text-center py-14 space-y-2">
            <p className="text-2xl mb-1">🎟️</p>
            <p className="font-medium text-sm text-warm-700">Browse any ticket site above</p>
            <p className="text-sm text-warm-400 max-w-sm mx-auto">
              TicketOps captures pricing data in real-time as you browse — no extensions needed.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ─── Split-Screen ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-112px)]">
      {/* Browser Toolbar */}
      <div
        ref={toolbarRef}
        className="flex items-center gap-1.5 px-2 shrink-0"
        style={{
          backgroundColor: "#3D3929",
          borderBottom: "1px solid #4A4539",
          height: "42px",
          zIndex: 9999,
          position: "relative",
        }}
      >
        {/* Back / Forward / Refresh — compact icon buttons */}
        <ToolbarIconBtn onClick={() => api?.back?.()} title="Back">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </ToolbarIconBtn>
        <ToolbarIconBtn onClick={() => api?.forward?.()} title="Forward">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </ToolbarIconBtn>
        <ToolbarIconBtn onClick={() => api?.refresh?.()} title="Refresh">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        </ToolbarIconBtn>

        {/* URL input — full width, rounded */}
        <form onSubmit={handleSubmit} className="flex-1 flex mx-1">
          <div className="relative w-full">
            {loading && (
              <div className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center">
                <div
                  className="h-2 w-2 rounded-full animate-pulse"
                  style={{ backgroundColor: "#F59E0B" }}
                />
              </div>
            )}
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter URL or search..."
              className="w-full rounded-full py-1 text-xs transition-all duration-150"
              style={{
                border: "1px solid #4A4539",
                backgroundColor: "#2D2B28",
                color: "#F5F0EB",
                paddingLeft: loading ? "24px" : "12px",
                paddingRight: "12px",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#D97706";
                e.currentTarget.style.boxShadow = "0 0 0 2px rgba(217,119,6,0.2)";
                e.currentTarget.select();
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#4A4539";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
        </form>

        {/* Close button — compact */}
        <ToolbarIconBtn onClick={closeBrowser} title="Close browser (Esc)">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </ToolbarIconBtn>
      </div>

      {/* Split: BrowserView (left) + Data Panel (right) */}
      <div className="flex flex-1 overflow-hidden">
        {/* BrowserView placeholder — Electron renders the real browser here */}
        <div className="flex-1" style={{ backgroundColor: "#F5F0EB" }} />

        {/* Drag handle for resizing data panel */}
        <div
          onMouseDown={startResize}
          className="shrink-0 flex items-center justify-center cursor-col-resize group"
          style={{ width: "6px", backgroundColor: "#E8E2DB" }}
        >
          <div
            className="w-0.5 h-8 rounded-full transition-colors"
            style={{ backgroundColor: "#C8C2BA" }}
          />
        </div>

        {/* Data Panel — resizable */}
        <div
          className="shrink-0 flex flex-col overflow-hidden"
          style={{
            width: `${panelWidth}px`,
            borderLeft: "none",
            backgroundColor: "#FFFFFF",
          }}
        >
          {/* Panel tabs */}
          <div
            className="flex shrink-0 border-b"
            style={{ borderColor: "#E8E2DB" }}
          >
            {(["live", "history"] as const).map((tab) => {
              const isActive = dataTab === tab;
              const label = tab === "live" ? "Live Data" : "History";
              const badge =
                tab === "live" && data && data.count > 0
                  ? data.count
                  : tab === "history" && history.length > 0
                  ? history.length
                  : null;

              return (
                <button
                  key={tab}
                  onClick={() => setDataTab(tab)}
                  className="flex-1 py-2.5 text-xs font-semibold transition-all duration-150 flex items-center justify-center gap-1.5"
                  style={{
                    color: isActive ? "#D97706" : "#8C8680",
                    borderBottom: isActive ? "2px solid #D97706" : "2px solid transparent",
                    backgroundColor: isActive ? "rgba(217,119,6,0.04)" : "transparent",
                  }}
                >
                  {label}
                  {badge !== null && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                      style={
                        tab === "live"
                          ? { backgroundColor: "#D97706", color: "#FFFFFF" }
                          : { backgroundColor: "#E8E2DB", color: "#4A4845" }
                      }
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Panel content — scrolls independently */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {dataTab === "live" && (
              <>
                {(!data || data.count === 0) && (
                  <div className="text-center py-16 space-y-3">
                    <div
                      className="inline-flex h-12 w-12 items-center justify-center rounded-xl mx-auto"
                      style={{ backgroundColor: "rgba(217,119,6,0.08)" }}
                    >
                      <svg
                        className="h-6 w-6"
                        style={{ color: "#D97706" }}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-warm-700">Browse a ticket site to see pricing data here</p>
                    <p className="text-xs text-warm-400">
                      Data appears automatically as you navigate event pages
                    </p>
                  </div>
                )}

                {data && data.count > 0 && stats && (
                  <>
                    {/* Event info */}
                    <div
                      className="rounded-lg p-3"
                      style={{ backgroundColor: "#FAF9F6", border: "1px solid #E8E2DB" }}
                    >
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: "#2D2B28" }}
                        title={data.eventName}
                      >
                        {data.eventName}
                      </p>
                      <span
                        className="inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: "rgba(217,119,6,0.1)",
                          color: "#b45309",
                        }}
                      >
                        {data.platform}
                      </span>
                    </div>

                    {/* Save button */}
                    <button
                      onClick={saveSnapshot}
                      disabled={saved}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all duration-150"
                      style={{
                        backgroundColor: saved
                          ? "rgba(5, 150, 105, 0.1)"
                          : "#D97706",
                        color: saved ? "#059669" : "#FFFFFF",
                        cursor: saved ? "default" : "pointer",
                        boxShadow: saved ? "none" : "0 1px 3px rgba(217,119,6,0.25)",
                      }}
                    >
                      {saved ? (
                        <>
                          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Saved to Database
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
                          </svg>
                          Save Snapshot
                        </>
                      )}
                    </button>

                    {/* Stat grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Get-in", value: fmt(stats.getIn), highlight: true },
                        { label: "Median", value: fmt(stats.median), highlight: false },
                        { label: "Average", value: fmt(stats.avg), highlight: false },
                        { label: "Listings", value: stats.total.toLocaleString(), highlight: false },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-lg p-3"
                          style={{
                            backgroundColor: s.highlight ? "rgba(5,150,105,0.06)" : "#FAF9F6",
                            border: s.highlight ? "1px solid rgba(5,150,105,0.15)" : "1px solid #E8E2DB",
                          }}
                        >
                          <p
                            className="text-[10px] uppercase tracking-wider font-medium"
                            style={{ color: "#A89F91" }}
                          >
                            {s.label}
                          </p>
                          <p
                            className="text-base font-bold mt-0.5 tabular-nums"
                            style={{ color: s.highlight ? "#059669" : "#2D2B28" }}
                          >
                            {s.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Listings table */}
                    <div>
                      <p
                        className="text-[10px] uppercase tracking-wider font-semibold mb-2"
                        style={{ color: "#A89F91" }}
                      >
                        All Listings — sorted by price
                      </p>
                      <div className="overflow-y-auto max-h-[calc(100vh-520px)] rounded-lg border" style={{ borderColor: "#E8E2DB" }}>
                        <table className="w-full text-xs">
                          <thead
                            className="sticky top-0"
                            style={{ backgroundColor: "#FAF9F6", borderBottom: "1px solid #E8E2DB" }}
                          >
                            <tr style={{ color: "#8C8680" }}>
                              <th className="text-left px-2 py-2 font-semibold">Section</th>
                              <th className="text-left px-2 py-2 font-semibold">Row</th>
                              <th className="text-right px-2 py-2 font-semibold">Price</th>
                              <th className="text-right px-2 py-2 font-semibold">Qty</th>
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
                                    backgroundColor: i % 2 === 0 ? "#FFFFFF" : "rgba(250,249,246,0.5)",
                                  }}
                                  onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                                      "rgba(245,240,235,0.8)";
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                                      i % 2 === 0 ? "#FFFFFF" : "rgba(250,249,246,0.5)";
                                  }}
                                >
                                  <td className="px-2 py-1.5 truncate max-w-[80px] text-warm-700">
                                    {l.section || "—"}
                                  </td>
                                  <td className="px-2 py-1.5 text-warm-500">
                                    {l.row || "—"}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    {i === 0 ? (
                                      <span className="font-bold" style={{ color: "#059669" }}>
                                        {fmt(l.price)}
                                      </span>
                                    ) : (
                                      <span style={{ color: "#2D2B28" }}>{fmt(l.price)}</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-warm-500">
                                    {l.quantity}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        {data.count > 200 && (
                          <p
                            className="text-[10px] text-center py-2"
                            style={{ color: "#A89F91", backgroundColor: "#FAF9F6" }}
                          >
                            Showing top 200 of {data.count.toLocaleString()} listings
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
                  <div className="text-center py-16 space-y-2">
                    <p className="text-sm font-medium text-warm-600">No history yet</p>
                    <p className="text-xs text-warm-400">
                      Events you browse will appear here
                    </p>
                  </div>
                )}
                {history.map((h, i) => (
                  <div
                    key={i}
                    className="rounded-lg p-3 cursor-pointer transition-all duration-150"
                    style={{
                      backgroundColor: "#FAF9F6",
                      border: "1px solid #E8E2DB",
                    }}
                    onClick={() => navigate(h.url)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = "#F5F0EB";
                      (e.currentTarget as HTMLDivElement).style.borderColor = "#D97706";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = "#FAF9F6";
                      (e.currentTarget as HTMLDivElement).style.borderColor = "#E8E2DB";
                    }}
                  >
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: "#2D2B28" }}
                    >
                      {h.eventName}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#A89F91" }}>
                      {h.platform} &middot; {h.time}
                    </p>
                    <div className="flex gap-4 mt-2 text-xs border-t pt-2" style={{ borderColor: "#E8E2DB" }}>
                      <span>
                        <span style={{ color: "#A89F91" }}>Get-in </span>
                        <span className="font-bold" style={{ color: "#059669" }}>
                          {fmt(h.getIn)}
                        </span>
                      </span>
                      <span>
                        <span style={{ color: "#A89F91" }}>Median </span>
                        <span className="font-semibold" style={{ color: "#2D2B28" }}>
                          {fmt(h.median)}
                        </span>
                      </span>
                      <span>
                        <span style={{ color: "#A89F91" }}>Qty </span>
                        <span className="font-semibold" style={{ color: "#2D2B28" }}>
                          {h.total.toLocaleString()}
                        </span>
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
