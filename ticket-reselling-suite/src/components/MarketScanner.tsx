"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ScanResult {
  eventName: string;
  venue: string;
  date: string;
  platform: string;
  listings: Array<{
    section: string;
    row: string;
    price: number;
    quantity: number;
    priceWithFees: number | null;
    ticketsRemaining: number | null;
  }>;
  stats: {
    getInPrice: number;
    medianPrice: number;
    averagePrice: number;
    maxPrice: number;
    totalListings: number;
    totalTicketsRemaining: number | null;
  };
  scannedAt: string;
}

interface SavedScan {
  url: string;
  platform: string;
  eventName: string | null;
  lastScanned: string;
}

const STORAGE_KEY = "market-scanner-saved-scans";

const SUPPORTED_PLATFORMS = [
  "stubhub.com",
  "ticketmaster.com",
  "vividseats.com",
  "seatgeek.com",
  "etix.com",
];

const AUTO_REFRESH_OPTIONS = [
  { label: "5 min", value: 5 * 60 * 1000 },
  { label: "15 min", value: 15 * 60 * 1000 },
  { label: "30 min", value: 30 * 60 * 1000 },
];

function detectPlatform(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const platform of SUPPORTED_PLATFORMS) {
      if (hostname.includes(platform.replace(".com", ""))) {
        return platform.replace(".com", "").charAt(0).toUpperCase() +
          platform.replace(".com", "").slice(1);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function formatCurrency(n: number | null): string {
  if (n === null || n === undefined) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function loadSavedScans(): SavedScan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedScans(scans: SavedScan[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export function MarketScanner() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [savedScans, setSavedScans] = useState<SavedScan[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(
    AUTO_REFRESH_OPTIONS[1].value
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load saved scans from localStorage on mount
  useEffect(() => {
    setSavedScans(loadSavedScans());
  }, []);

  const runScan = useCallback(
    async (targetUrl: string) => {
      const platform = detectPlatform(targetUrl);
      if (!platform) {
        setError(
          "Unsupported URL. Paste a link from StubHub, Ticketmaster, VividSeats, SeatGeek, or Etix."
        );
        return;
      }

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/scanner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            body?.message ?? `Scanner returned ${res.status}`
          );
        }

        const data: ScanResult = await res.json();
        setResult(data);

        // Upsert into saved scans
        setSavedScans((prev) => {
          const filtered = prev.filter((s) => s.url !== targetUrl);
          const next: SavedScan[] = [
            {
              url: targetUrl,
              platform: data.platform,
              eventName: data.eventName,
              lastScanned: data.scannedAt,
            },
            ...filtered,
          ].slice(0, 20);
          persistSavedScans(next);
          return next;
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "An unexpected error occurred."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Handle auto-refresh interval — use ref for runScan to avoid re-subscribe
  const runScanRef = useRef(runScan);
  runScanRef.current = runScan;

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoRefresh && url) {
      intervalRef.current = setInterval(() => {
        runScanRef.current(url);
      }, refreshInterval);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, refreshInterval, url]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    runScan(url.trim());
  }

  function handleSavedScanClick(savedUrl: string) {
    setUrl(savedUrl);
    runScan(savedUrl);
  }

  function handleRemoveSavedScan(targetUrl: string) {
    setSavedScans((prev) => {
      const next = prev.filter((s) => s.url !== targetUrl);
      persistSavedScans(next);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Scanner Input */}
      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="scanner-url"
              className="section-label block mb-2"
            >
              Marketplace URL
            </label>
            <div className="flex gap-3">
              {/* URL bar with link icon */}
              <div className="relative flex-1">
                <div
                  className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
                  style={{ color: "#A89F91" }}
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  id="scanner-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.stubhub.com/event/..."
                  className="w-full rounded-lg border pl-10 pr-3 py-2.5 text-sm transition-all duration-150"
                  style={{
                    backgroundColor: "#FAF9F6",
                    borderColor: "#E8E2DB",
                    color: "#2D2B28",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#D97706";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(217,119,6,0.12)";
                    e.currentTarget.style.backgroundColor = "#FFFFFF";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#E8E2DB";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.backgroundColor = "#FAF9F6";
                  }}
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={!url.trim() || loading}
                className="btn-primary whitespace-nowrap gap-2"
              >
                {loading ? (
                  <>
                    <Spinner />
                    Scanning…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                    Scan Now
                  </>
                )}
              </button>
            </div>
            <p className="text-xs mt-1.5" style={{ color: "#A89F91" }}>
              Supports StubHub, Ticketmaster, VividSeats, SeatGeek, and Etix
            </p>
          </div>

          {/* Auto-refresh controls */}
          <div
            className="flex items-center gap-4 border-t pt-3"
            style={{ borderColor: "#E8E2DB" }}
          >
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 rounded"
                style={{ accentColor: "#D97706" }}
              />
              <span className="text-sm font-medium" style={{ color: "#4A4845" }}>
                Auto-refresh
              </span>
            </label>

            {autoRefresh && (
              <div className="flex items-center gap-2">
                {AUTO_REFRESH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRefreshInterval(opt.value)}
                    className="text-xs px-2.5 py-1 rounded-md font-medium transition-all duration-150"
                    style={
                      refreshInterval === opt.value
                        ? { backgroundColor: "#D97706", color: "#FFFFFF" }
                        : { backgroundColor: "#F5F0EB", color: "#8C8680" }
                    }
                  >
                    {opt.label}
                  </button>
                ))}
                <span className="badge-green font-semibold">Active</span>
              </div>
            )}
          </div>
        </form>

        {error && (
          <div
            className="mt-4 flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
            style={{
              backgroundColor: "rgba(220,38,38,0.06)",
              border: "1px solid rgba(220,38,38,0.2)",
              color: "#dc2626",
            }}
          >
            <svg className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}
      </div>

      {/* Loading state — full-card spinner */}
      {loading && !result && (
        <div className="card flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <Spinner size="lg" />
            <div
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: "0 0 20px rgba(217,119,6,0.15)" }}
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium" style={{ color: "#2D2B28" }}>
              Scanning marketplace…
            </p>
            <p className="text-xs mt-1" style={{ color: "#A89F91" }}>
              This may take 15–30 seconds
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Event header */}
          <div className="card">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-warm-900 truncate">
                  {result.eventName}
                </h2>
                <p className="text-sm text-warm-400 mt-0.5">
                  {result.venue}
                  <span className="mx-1.5 text-warm-300">&middot;</span>
                  {result.date}
                </p>
              </div>
              <span className="badge-green shrink-0 text-xs">{result.platform}</span>
            </div>

            {/* Summary stat grid */}
            <div
              className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 pt-4 border-t"
              style={{ borderColor: "#E8E2DB" }}
            >
              <div className="stat-card">
                <span className="stat-label">Get-in Price</span>
                <span className="stat-value text-green-600">
                  {formatCurrency(result.stats.getInPrice)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Median Price</span>
                <span className="stat-value" style={{ color: "#D97706" }}>
                  {formatCurrency(result.stats.medianPrice)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Avg. Price</span>
                <span className="stat-value text-warm-800">
                  {formatCurrency(result.stats.averagePrice)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Total Listings</span>
                <span className="stat-value text-warm-900">
                  {result.stats.totalListings.toLocaleString()}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Tickets Remaining</span>
                <span
                  className="stat-value"
                  style={{
                    color:
                      result.stats.totalTicketsRemaining == null
                        ? "#8C8680"
                        : result.stats.totalTicketsRemaining > 50
                          ? "#16a34a"
                          : result.stats.totalTicketsRemaining >= 10
                            ? "#d97706"
                            : "#dc2626",
                  }}
                >
                  {result.stats.totalTicketsRemaining != null
                    ? result.stats.totalTicketsRemaining.toLocaleString()
                    : "Unknown"}
                </span>
              </div>
            </div>

            <p className="text-xs mt-3" style={{ color: "#A89F91" }}>
              Scanned {formatTime(result.scannedAt)}
              {autoRefresh && (
                <span>
                  {" \u00b7 "}Auto-refreshing every{" "}
                  {AUTO_REFRESH_OPTIONS.find((o) => o.value === refreshInterval)?.label ?? ""}
                </span>
              )}
            </p>
          </div>

          {/* Listings table */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3 border-b" style={{ borderColor: "#E8E2DB" }}>
              <p className="section-label">
                {result.listings.length} Listings
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3 font-semibold">Section</th>
                    <th className="px-4 py-3 font-semibold">Row</th>
                    <th className="px-4 py-3 font-semibold text-right">Price</th>
                    <th className="px-4 py-3 font-semibold text-right">Qty</th>
                    <th className="px-4 py-3 font-semibold text-right">Fees</th>
                    <th className="px-4 py-3 font-semibold text-right">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {result.listings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <p className="text-sm font-medium" style={{ color: "#8C8680" }}>
                          No listings found
                        </p>
                        <p className="text-xs mt-1" style={{ color: "#A89F91" }}>
                          This event may be sold out or not yet on sale.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    result.listings.map((listing, idx) => {
                      const fees =
                        listing.priceWithFees !== null
                          ? listing.priceWithFees - listing.price
                          : null;
                      const isGetIn = listing.price === result.stats.getInPrice;

                      return (
                        <tr key={`${listing.section}-${listing.row}-${idx}`} className="table-row">
                          <td className="px-4 py-3 font-medium text-warm-800">
                            {listing.section}
                          </td>
                          <td className="px-4 py-3 text-warm-600">{listing.row}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            <span
                              className={
                                isGetIn
                                  ? "font-semibold text-green-600"
                                  : "text-warm-800"
                              }
                            >
                              {formatCurrency(listing.price)}
                            </span>
                            {isGetIn && (
                              <span className="badge-green ml-2 text-xs">
                                Get-in
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-warm-600">
                            {listing.quantity}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {fees !== null ? (
                              <span
                                style={{
                                  color:
                                    fees > listing.price * 0.25
                                      ? "#dc2626"
                                      : "#8C8680",
                                }}
                              >
                                {formatCurrency(fees)}
                              </span>
                            ) : (
                              <span style={{ color: "#C4BBB0" }}>&mdash;</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {listing.ticketsRemaining != null ? (
                              <span
                                style={{
                                  color:
                                    listing.ticketsRemaining > 50
                                      ? "#16a34a"
                                      : listing.ticketsRemaining >= 10
                                        ? "#d97706"
                                        : "#dc2626",
                                  fontWeight: listing.ticketsRemaining < 10 ? 600 : 400,
                                }}
                              >
                                {listing.ticketsRemaining}
                              </span>
                            ) : (
                              <span style={{ color: "#C4BBB0" }}>&mdash;</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Saved Scans */}
      {savedScans.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-label">Saved Scans</p>
            <button
              onClick={() => {
                setSavedScans([]);
                persistSavedScans([]);
              }}
              className="btn-ghost text-xs py-1 px-2"
            >
              Clear all
            </button>
          </div>

          <div className="space-y-2">
            {savedScans.map((scan) => (
              <div
                key={scan.url}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 group transition-colors duration-150"
                style={{
                  backgroundColor: "#FAF9F6",
                  border: "1px solid #E8E2DB",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = "#F5F0EB";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = "#FAF9F6";
                }}
              >
                <span className="badge-yellow text-xs shrink-0">
                  {scan.platform}
                </span>
                <button
                  onClick={() => handleSavedScanClick(scan.url)}
                  className="flex-1 min-w-0 text-left"
                >
                  <span
                    className="text-sm font-medium truncate block transition-colors duration-150"
                    style={{ color: "#2D2B28" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLSpanElement).style.color = "#D97706";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLSpanElement).style.color = "#2D2B28";
                    }}
                  >
                    {scan.eventName ?? scan.url}
                  </span>
                  <span className="text-xs block mt-0.5" style={{ color: "#A89F91" }}>
                    Last scanned {formatTime(scan.lastScanned)}
                  </span>
                </button>
                <button
                  onClick={() => handleRemoveSavedScan(scan.url)}
                  className="h-6 w-6 flex items-center justify-center rounded-md text-xs opacity-0 group-hover:opacity-100 transition-all duration-150"
                  style={{ color: "#A89F91" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(220,38,38,0.08)";
                    e.currentTarget.style.color = "#dc2626";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "#A89F91";
                  }}
                  aria-label="Remove saved scan"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — no results yet */}
      {!loading && !result && savedScans.length === 0 && (
        <div className="empty-state">
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
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="empty-state-title">No scans yet</p>
          <p className="empty-state-body">
            Paste a StubHub, Ticketmaster, or VividSeats event URL above to see live pricing data.
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- Spinner ---------- */

function Spinner({ size = "sm" }: { size?: "sm" | "lg" }) {
  const dims = size === "lg" ? "h-10 w-10" : "h-4 w-4";
  return (
    <svg
      className={`animate-spin ${dims}`}
      style={{ color: "#D97706" }}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
