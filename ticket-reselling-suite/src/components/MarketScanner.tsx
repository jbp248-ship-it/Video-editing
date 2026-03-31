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
  }>;
  stats: {
    getInPrice: number;
    medianPrice: number;
    averagePrice: number;
    maxPrice: number;
    totalListings: number;
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

  // Handle auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoRefresh && url) {
      intervalRef.current = setInterval(() => {
        runScan(url);
      }, refreshInterval);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, refreshInterval, url, runScan]);

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
              className="block text-sm font-medium text-slate-400 mb-1"
            >
              Marketplace URL
            </label>
            <div className="flex gap-3">
              <input
                id="scanner-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.stubhub.com/event/..."
                className="flex-1 rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={!url.trim() || loading}
                className="btn-primary whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Spinner />
                    Scanning...
                  </span>
                ) : (
                  "Scan Now"
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Supports StubHub, Ticketmaster, VividSeats, SeatGeek, and Etix
            </p>
          </div>

          {/* Auto-refresh controls */}
          <div className="flex items-center gap-4 border-t border-slate-700 pt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
              />
              <span className="text-sm text-slate-300">Auto-refresh</span>
            </label>

            {autoRefresh && (
              <div className="flex items-center gap-2">
                {AUTO_REFRESH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRefreshInterval(opt.value)}
                    className={`text-xs px-2 py-1 rounded ${
                      refreshInterval === opt.value
                        ? "bg-sky-600 text-white"
                        : "bg-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <span className="badge-green text-xs">Active</span>
              </div>
            )}
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && !result && (
        <div className="card flex flex-col items-center justify-center py-16 gap-3">
          <Spinner size="lg" />
          <p className="text-slate-400 text-sm">
            Scanning marketplace... this may take 15-30 seconds.
          </p>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Event header */}
          <div className="card">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  {result.eventName}
                </h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  {result.venue} &middot; {result.date}
                </p>
              </div>
              <span className="badge-green">{result.platform}</span>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-700">
              <div className="stat-card">
                <span className="stat-label">Get-in Price</span>
                <span className="stat-value text-green-400">
                  {formatCurrency(result.stats.getInPrice)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Median Price</span>
                <span className="stat-value text-sky-400">
                  {formatCurrency(result.stats.medianPrice)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Total Listings</span>
                <span className="stat-value text-white">
                  {result.stats.totalListings.toLocaleString()}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Event Name</span>
                <span className="stat-value text-white text-sm truncate">
                  {result.eventName}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-3">
              Scanned at {formatTime(result.scannedAt)}
              {autoRefresh &&
                ` \u00b7 Auto-refreshing every ${
                  AUTO_REFRESH_OPTIONS.find(
                    (o) => o.value === refreshInterval
                  )?.label ?? ""
                }`}
            </p>
          </div>

          {/* Listings table */}
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs uppercase text-slate-400">
                  <th className="px-4 py-3">Section</th>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Fees</th>
                </tr>
              </thead>
              <tbody>
                {result.listings.map((listing, idx) => {
                  const fees =
                    listing.priceWithFees !== null
                      ? listing.priceWithFees - listing.price
                      : null;

                  return (
                    <tr key={`${listing.section}-${listing.row}-${idx}`} className="table-row">
                      <td className="px-4 py-3 font-medium">
                        {listing.section}
                      </td>
                      <td className="px-4 py-3">{listing.row}</td>
                      <td className="px-4 py-3">
                        {formatCurrency(listing.price)}
                        {listing.price === result.stats.getInPrice && (
                          <span className="badge-green ml-2 text-xs">
                            Get-in
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{listing.quantity}</td>
                      <td className="px-4 py-3">
                        {fees !== null ? (
                          <span
                            className={
                              fees > listing.price * 0.25
                                ? "text-red-400"
                                : "text-slate-400"
                            }
                          >
                            {formatCurrency(fees)}
                          </span>
                        ) : (
                          <span className="text-slate-500">\u2014</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {result.listings.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No listings found for this event.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Saved Scans */}
      {savedScans.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-400">
              Saved Scans
            </h3>
            <button
              onClick={() => {
                setSavedScans([]);
                persistSavedScans([]);
              }}
              className="btn-ghost text-xs"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-2">
            {savedScans.map((scan) => (
              <div
                key={scan.url}
                className="flex items-center gap-3 rounded-md bg-slate-900/60 border border-slate-700 px-3 py-2 group"
              >
                <span className="badge-green text-xs shrink-0">
                  {scan.platform}
                </span>
                <button
                  onClick={() => handleSavedScanClick(scan.url)}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="text-sm text-slate-200 truncate block hover:text-sky-400 transition-colors">
                    {scan.eventName ?? scan.url}
                  </span>
                  <span className="text-xs text-slate-500">
                    Last scanned {formatTime(scan.lastScanned)}
                  </span>
                </button>
                <button
                  onClick={() => handleRemoveSavedScan(scan.url)}
                  className="text-slate-600 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                  aria-label="Remove saved scan"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Spinner ---------- */

function Spinner({ size = "sm" }: { size?: "sm" | "lg" }) {
  const dims = size === "lg" ? "h-8 w-8" : "h-4 w-4";
  return (
    <svg
      className={`animate-spin ${dims} text-sky-400`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
