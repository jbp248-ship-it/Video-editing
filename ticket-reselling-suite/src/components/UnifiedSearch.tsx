"use client";

import { useState, useCallback } from "react";

interface SearchResult {
  platform: string;
  eventName: string;
  venue: string;
  date: string;
  url: string;
  getInPrice: number | null;
  totalListings: number | null;
  ticketsRemaining: number | null;
}

interface VenueHistoryEntry {
  date: string;
  eventName: string;
  platform: string;
  getInPrice: number;
  totalListings: number;
}

interface GroupedEvent {
  key: string;
  eventName: string;
  venue: string;
  date: string;
  platforms: SearchResult[];
  cheapest: SearchResult | null;
}

function groupResults(results: SearchResult[]): GroupedEvent[] {
  const groups = new Map<string, SearchResult[]>();
  for (const r of results) {
    const key = `${r.eventName}|||${r.venue}|||${r.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return Array.from(groups.entries()).map(([key, platforms]) => {
    const first = platforms[0];
    const withPrice = platforms.filter((p) => p.getInPrice !== null);
    const cheapest =
      withPrice.length > 0
        ? withPrice.reduce((a, b) =>
            (a.getInPrice ?? Infinity) <= (b.getInPrice ?? Infinity) ? a : b
          )
        : null;
    return {
      key,
      eventName: first.eventName,
      venue: first.venue,
      date: first.date,
      platforms,
      cheapest,
    };
  });
}

function platformColor(platform: string): string {
  const lower = platform.toLowerCase();
  if (lower.includes("stubhub")) return "#7C3AED";
  if (lower.includes("ticketmaster")) return "#2563EB";
  if (lower.includes("vivid")) return "#059669";
  if (lower.includes("seatgeek")) return "#EA580C";
  return "#6B7280";
}

function formatPrice(price: number | null): string {
  if (price === null) return "N/A";
  return `$${price.toFixed(2)}`;
}

export function UnifiedSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [venueHistory, setVenueHistory] = useState<
    Record<string, VenueHistoryEntry[]>
  >({});
  const [loadingVenue, setLoadingVenue] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setVenueHistory({});
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query.trim())}`
      );
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch]
  );

  const handleBrowse = useCallback((url: string) => {
    if (window.ticketOps?.navigate) {
      window.ticketOps.navigate(url);
    } else {
      window.open(url, "_blank");
    }
  }, []);

  const handleVenueHistory = useCallback(
    async (venue: string) => {
      if (venueHistory[venue]) {
        // Toggle off
        setVenueHistory((prev) => {
          const next = { ...prev };
          delete next[venue];
          return next;
        });
        return;
      }
      setLoadingVenue(venue);
      try {
        const res = await fetch(
          `/api/history/venue?venue=${encodeURIComponent(venue)}`
        );
        if (!res.ok) throw new Error("Failed to load venue history");
        const data = await res.json();
        setVenueHistory((prev) => ({
          ...prev,
          [venue]: data.history ?? [],
        }));
      } catch {
        // Silently fail — not critical
      } finally {
        setLoadingVenue(null);
      }
    },
    [venueHistory]
  );

  const grouped = groupResults(results);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#FAF9F6",
        padding: "32px 24px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#1F2937",
            margin: 0,
          }}
        >
          Ticket Price Comparison
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#6B7280",
            marginTop: 6,
          }}
        >
          Compare prices across StubHub, Ticketmaster, and more
        </p>
      </div>

      {/* Search Bar */}
      <div
        style={{
          maxWidth: 680,
          margin: "0 auto 36px",
          display: "flex",
          gap: 10,
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search for any artist, event, or venue..."
          style={{
            flex: 1,
            padding: "14px 18px",
            fontSize: 16,
            border: "2px solid #E5E7EB",
            borderRadius: 10,
            outline: "none",
            backgroundColor: "#FFFFFF",
            color: "#1F2937",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#D97706")}
          onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          style={{
            padding: "14px 28px",
            fontSize: 16,
            fontWeight: 600,
            backgroundColor: loading || !query.trim() ? "#F3D7A0" : "#D97706",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 10,
            cursor: loading || !query.trim() ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            transition: "background-color 0.15s",
          }}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div
            style={{
              display: "inline-block",
              width: 36,
              height: 36,
              border: "3px solid #E5E7EB",
              borderTopColor: "#D97706",
              borderRadius: "50%",
              animation: "unified-search-spin 0.8s linear infinite",
            }}
          />
          <p style={{ color: "#6B7280", marginTop: 14, fontSize: 15 }}>
            Searching StubHub, Ticketmaster...
          </p>
          <style>{`@keyframes unified-search-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            padding: "16px 20px",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: 10,
            color: "#DC2626",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      {/* Empty State (before any search) */}
      {!loading && !error && !searched && (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>
            &#x1F50D;
          </div>
          <p style={{ color: "#9CA3AF", fontSize: 16, maxWidth: 400, margin: "0 auto" }}>
            Search for an artist or event to compare prices across platforms
          </p>
        </div>
      )}

      {/* No Results State */}
      {!loading && !error && searched && results.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <p style={{ color: "#6B7280", fontSize: 15 }}>
            No events found for &ldquo;{query}&rdquo;. Try a different search.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && grouped.length > 0 && (
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <p
            style={{
              fontSize: 13,
              color: "#9CA3AF",
              marginBottom: 16,
            }}
          >
            {results.length} result{results.length !== 1 ? "s" : ""} across{" "}
            {grouped.length} event{grouped.length !== 1 ? "s" : ""}
          </p>

          {grouped.map((group) => (
            <div
              key={group.key}
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                border: "1px solid #E5E7EB",
                padding: "20px 24px",
                marginBottom: 16,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              {/* Event Header */}
              <div style={{ marginBottom: 16 }}>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    color: "#1F2937",
                    margin: 0,
                  }}
                >
                  {group.eventName}
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: "#6B7280",
                    marginTop: 4,
                    margin: 0,
                  }}
                >
                  {group.venue} &mdash; {group.date}
                </p>
              </div>

              {/* Platform Comparison Table */}
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "2px solid #F3F4F6",
                    }}
                  >
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        color: "#9CA3AF",
                        fontWeight: 500,
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Platform
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "8px 10px",
                        color: "#9CA3AF",
                        fontWeight: 500,
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Get-In Price
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "8px 10px",
                        color: "#9CA3AF",
                        fontWeight: 500,
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Listings
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "8px 10px",
                        color: "#9CA3AF",
                        fontWeight: 500,
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.platforms.map((p, idx) => {
                    const isCheapest =
                      group.cheapest !== null &&
                      p.platform === group.cheapest.platform &&
                      p.getInPrice === group.cheapest.getInPrice;
                    return (
                      <tr
                        key={`${p.platform}-${idx}`}
                        style={{
                          borderBottom:
                            idx < group.platforms.length - 1
                              ? "1px solid #F3F4F6"
                              : "none",
                        }}
                      >
                        <td style={{ padding: "10px 10px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              backgroundColor: platformColor(p.platform),
                              marginRight: 8,
                              verticalAlign: "middle",
                            }}
                          />
                          <span
                            style={{
                              fontWeight: 500,
                              color: "#374151",
                              verticalAlign: "middle",
                            }}
                          >
                            {p.platform}
                          </span>
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            padding: "10px 10px",
                            fontWeight: isCheapest ? 700 : 500,
                            color: isCheapest ? "#059669" : "#374151",
                            fontSize: isCheapest ? 15 : 14,
                          }}
                        >
                          {formatPrice(p.getInPrice)}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            padding: "10px 10px",
                            color: "#6B7280",
                          }}
                        >
                          {p.totalListings !== null ? p.totalListings : "--"}
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 10px" }}>
                          <button
                            onClick={() => handleBrowse(p.url)}
                            style={{
                              padding: "5px 14px",
                              fontSize: 13,
                              fontWeight: 500,
                              backgroundColor: "#F3F4F6",
                              color: "#374151",
                              border: "1px solid #E5E7EB",
                              borderRadius: 6,
                              cursor: "pointer",
                              transition: "background-color 0.15s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor = "#E5E7EB")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor = "#F3F4F6")
                            }
                          >
                            Browse
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Cheapest Indicator */}
              {group.cheapest && group.platforms.length > 1 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "8px 12px",
                    backgroundColor: "#F0FDF4",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#059669",
                    fontWeight: 500,
                  }}
                >
                  Cheapest on:{" "}
                  <span style={{ fontWeight: 700 }}>
                    {group.cheapest.platform}
                  </span>{" "}
                  ({formatPrice(group.cheapest.getInPrice)})
                </div>
              )}

              {/* Venue History Link */}
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => handleVenueHistory(group.venue)}
                  disabled={loadingVenue === group.venue}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#D97706",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor:
                      loadingVenue === group.venue ? "wait" : "pointer",
                    padding: 0,
                    textDecoration: "none",
                  }}
                >
                  {loadingVenue === group.venue
                    ? "Loading venue history..."
                    : venueHistory[group.venue]
                    ? "Hide venue history"
                    : "View venue history \u2192"}
                </button>

                {/* Venue History Table */}
                {venueHistory[group.venue] &&
                  venueHistory[group.venue].length > 0 && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "12px 14px",
                        backgroundColor: "#FFFBEB",
                        borderRadius: 8,
                        border: "1px solid #FDE68A",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#92400E",
                          marginBottom: 8,
                          margin: 0,
                        }}
                      >
                        Recent events at {group.venue}
                      </p>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 12,
                          marginTop: 8,
                        }}
                      >
                        <thead>
                          <tr>
                            <th
                              style={{
                                textAlign: "left",
                                padding: "4px 6px",
                                color: "#92400E",
                                fontWeight: 500,
                              }}
                            >
                              Date
                            </th>
                            <th
                              style={{
                                textAlign: "left",
                                padding: "4px 6px",
                                color: "#92400E",
                                fontWeight: 500,
                              }}
                            >
                              Event
                            </th>
                            <th
                              style={{
                                textAlign: "right",
                                padding: "4px 6px",
                                color: "#92400E",
                                fontWeight: 500,
                              }}
                            >
                              Get-In
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {venueHistory[group.venue].map((entry, i) => (
                            <tr
                              key={i}
                              style={{
                                borderTop:
                                  i > 0 ? "1px solid #FDE68A" : "none",
                              }}
                            >
                              <td
                                style={{
                                  padding: "4px 6px",
                                  color: "#78350F",
                                }}
                              >
                                {entry.date}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  color: "#78350F",
                                }}
                              >
                                {entry.eventName}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  color: "#78350F",
                                  textAlign: "right",
                                }}
                              >
                                {formatPrice(entry.getInPrice)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                {venueHistory[group.venue] &&
                  venueHistory[group.venue].length === 0 && (
                    <p
                      style={{
                        fontSize: 12,
                        color: "#9CA3AF",
                        marginTop: 6,
                      }}
                    >
                      No history available for this venue.
                    </p>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
