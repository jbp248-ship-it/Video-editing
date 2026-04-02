"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { StatsGrid } from "@/components/StatsGrid";
import { InventoryTable } from "@/components/InventoryTable";
import { AlertPanel } from "@/components/AlertPanel";
import { PriceTrendChart } from "@/components/PriceTrendChart";
import { MarketScanner } from "@/components/MarketScanner";
import { TicketBrowser } from "@/components/TicketBrowser";
import { SalesHistory } from "@/components/SalesHistory";
import type { DashboardStats } from "@/types";

// ─── Platform fee defaults ────────────────────────────────────────────────────
const PLATFORM_FEES: { key: string; label: string; defaultFee: number }[] = [
  { key: "fee_STUBHUB", label: "StubHub", defaultFee: 15 },
  { key: "fee_TICKETMASTER", label: "Ticketmaster", defaultFee: 12 },
  { key: "fee_VIVID_SEATS", label: "Vivid Seats", defaultFee: 10 },
  { key: "fee_SEATGEEK", label: "SeatGeek", defaultFee: 12 },
  { key: "fee_ETIX", label: "Etix", defaultFee: 10 },
];

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel() {
  const [fees, setFees] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const p of PLATFORM_FEES) {
      defaults[p.key] = String(p.defaultFee);
    }
    return defaults;
  });
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Record<string, string>>;
      })
      .then((data) => {
        setFees((prev) => {
          const merged = { ...prev };
          for (const p of PLATFORM_FEES) {
            if (data[p.key] !== undefined) {
              merged[p.key] = data[p.key];
            }
          }
          return merged;
        });
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  const handleSave = async (key: string) => {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: fees[key] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedKeys((s) => ({ ...s, [key]: true }));
      setTimeout(() => setSavedKeys((s) => ({ ...s, [key]: false })), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save setting");
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  return (
    <div className="card max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold text-warm-900">Fee Configuration</h2>
      <p className="text-sm text-warm-500">
        Adjust platform fee percentages to match your seller tier. Changes are
        saved per platform.
      </p>
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load saved settings: {loadError}
        </div>
      )}
      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not save setting: {saveError}
        </div>
      )}
      <div className="space-y-3">
        {PLATFORM_FEES.map((p) => (
          <div
            key={p.key}
            className="flex items-center justify-between py-3 border-b border-warm-200 gap-4"
          >
            <span className="font-medium text-warm-900 w-36 shrink-0">
              {p.label}
            </span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                className="w-24 rounded-lg border border-warm-200 bg-warm-50 px-3 py-1.5 text-sm text-warm-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 text-right"
                value={fees[p.key] ?? String(p.defaultFee)}
                onChange={(e) =>
                  setFees((prev) => ({ ...prev, [p.key]: e.target.value }))
                }
              />
              <span className="text-sm text-warm-500">%</span>
            </div>
            <button
              className={
                savedKeys[p.key]
                  ? "btn-ghost text-xs text-green-600 border-green-200"
                  : "btn-primary text-xs"
              }
              disabled={saving[p.key]}
              onClick={() => handleSave(p.key)}
            >
              {savedKeys[p.key] ? "Saved!" : saving[p.key] ? "Saving…" : "Save"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inventory, setInventory] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [alerts, setAlerts] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inventoryFilter, setInventoryFilter] = useState("ALL");
  const [saleModal, setSaleModal] = useState<string | null>(null);
  const [saleForm, setSaleForm] = useState({
    price: "",
    qty: "1",
    platform: "STUBHUB",
  });

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, invRes, alertRes, snapRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/inventory"),
        fetch("/api/alerts"),
        fetch("/api/snapshots?days=30").catch(() => null),
      ]);

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        setStats(dashData);
        setAlertCount(dashData.unreadAlerts ?? 0);
      }
      if (invRes.ok) setInventory(await invRes.json());
      if (alertRes.ok) setAlerts(await alertRes.json());
      if (snapRes?.ok) setSnapshots(await snapRes.json());
      setFetchError(null);
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Failed to connect to API"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRecordSale = (inventoryId: string) => {
    setSaleModal(inventoryId);
    setSaleForm({ price: "", qty: "1", platform: "STUBHUB" });
  };

  const submitSale = async () => {
    if (!saleModal) return;
    const salePrice = parseFloat(saleForm.price);
    const quantitySold = parseInt(saleForm.qty, 10);
    if (isNaN(salePrice) || salePrice <= 0) return;
    if (isNaN(quantitySold) || quantitySold < 1) return;

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryId: saleModal,
          platform: saleForm.platform,
          salePrice,
          quantitySold,
          source: "MANUAL",
        }),
      });

      if (res.ok) {
        setSaleModal(null);
        fetchData();
      } else {
        try {
          const data = await res.json();
          setFetchError(data.error ?? `Sale failed (${res.status})`);
        } catch {
          setFetchError(`Sale failed (${res.status})`);
        }
      }
    } catch {
      setFetchError("Failed to record sale. Check that the app is running.");
    }
  };

  const handleDismissAlerts = async (ids: string[]) => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "dismiss" }),
    });
    setAlerts((prev) => prev.filter((a) => !ids.includes(a.id)));
    setAlertCount((c) => Math.max(0, c - ids.length));
  };

  const handleMarkRead = async (ids: string[]) => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "read" }),
    });
    setAlerts((prev) =>
      prev.map((a) => (ids.includes(a.id) ? { ...a, read: true } : a))
    );
    setAlertCount((c) => Math.max(0, c - ids.length));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-warm-50">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        alertCount={alertCount}
      />

      <main className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-warm-200 bg-white/80 backdrop-blur px-6">
          <h1 className="text-lg font-semibold capitalize text-warm-900">
            {activeTab === "market" ? "Market Scanner" : activeTab === "browse" ? "Browse Ticket Sites" : activeTab}
          </h1>
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Search events..."
              className="rounded-lg border border-warm-200 bg-warm-50 px-3 py-1.5 text-sm text-warm-700 placeholder-warm-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 w-64"
            />
            <button className="btn-primary">+ Add Tickets</button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Error Banner */}
          {fetchError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-red-700">
                Failed to load data: {fetchError}
              </span>
              <button
                className="text-xs text-red-500 hover:text-red-700"
                onClick={fetchData}
              >
                Retry
              </button>
            </div>
          )}

          {/* Dashboard View */}
          {activeTab === "dashboard" && (
            <>
              <StatsGrid stats={stats} />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Alerts panel */}
                <div className="lg:col-span-1">
                  <h2 className="text-sm font-medium text-warm-500 mb-3">
                    Active Alerts
                  </h2>
                  <AlertPanel
                    alerts={alerts}
                    onDismiss={handleDismissAlerts}
                    onMarkRead={handleMarkRead}
                  />
                </div>

                {/* Price trend */}
                <div className="lg:col-span-2">
                  <h2 className="text-sm font-medium text-warm-500 mb-3">
                    Market Overview
                  </h2>
                  <PriceTrendChart data={snapshots} />
                </div>
              </div>

              {/* Quick inventory view */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-warm-500">
                    Active Inventory
                  </h2>
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => setActiveTab("inventory")}
                  >
                    View All →
                  </button>
                </div>
                <InventoryTable
                  items={inventory}
                  onRecordSale={handleRecordSale}
                />
              </div>
            </>
          )}

          {/* Inventory View */}
          {activeTab === "inventory" && (
            <>
              <div className="flex items-center gap-3 mb-4">
                {["ALL", "IN_HAND", "LISTED", "PENDING_REMOVAL", "SOLD", "TRANSFERRED", "EXPIRED"].map(
                  (s) => (
                    <button
                      key={s}
                      className={
                        inventoryFilter === s
                          ? "btn-primary text-xs"
                          : "btn-ghost text-xs"
                      }
                      onClick={() => setInventoryFilter(s)}
                    >
                      {s.replace(/_/g, " ")}
                    </button>
                  )
                )}
              </div>
              <InventoryTable
                items={
                  inventoryFilter === "ALL"
                    ? inventory
                    : inventory.filter((item) => item.status === inventoryFilter)
                }
                onRecordSale={handleRecordSale}
              />
            </>
          )}

          {/* Sales View */}
          {activeTab === "sales" && <SalesHistory />}

          {/* Browse Sites View */}
          {activeTab === "browse" && <TicketBrowser />}

          {/* Market Scanner View */}
          {activeTab === "market" && <MarketScanner />}

          {/* Alerts View */}
          {activeTab === "alerts" && (
            <AlertPanel
              alerts={alerts}
              onDismiss={handleDismissAlerts}
              onMarkRead={handleMarkRead}
            />
          )}

          {/* Settings View */}
          {activeTab === "settings" && <SettingsPanel />}
        </div>
      </main>

      {/* Record Sale Modal */}
      {saleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/40 backdrop-blur-sm">
          <div className="card w-96 space-y-4 shadow-warm-lg">
            <h2 className="text-lg font-semibold text-warm-900">Record Sale</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-warm-500">Platform</label>
                <select
                  className="w-full rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 text-sm text-warm-700 mt-1 focus:border-brand-500 focus:outline-none"
                  value={saleForm.platform}
                  onChange={(e) =>
                    setSaleForm({ ...saleForm, platform: e.target.value })
                  }
                >
                  {["STUBHUB", "TICKETMASTER", "VIVID_SEATS", "SEATGEEK", "ETIX"].map(
                    (p) => (
                      <option key={p} value={p}>
                        {p.replace(/_/g, " ")}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-warm-500">
                  Sale Price (per ticket)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="w-full rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 text-sm text-warm-700 mt-1 focus:border-brand-500 focus:outline-none"
                  placeholder="$0.00"
                  value={saleForm.price}
                  onChange={(e) =>
                    setSaleForm({ ...saleForm, price: e.target.value })
                  }
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-warm-500">Quantity Sold</label>
                <input
                  type="number"
                  min="1"
                  className="w-full rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 text-sm text-warm-700 mt-1 focus:border-brand-500 focus:outline-none"
                  value={saleForm.qty}
                  onChange={(e) =>
                    setSaleForm({ ...saleForm, qty: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                className="btn-ghost"
                onClick={() => setSaleModal(null)}
              >
                Cancel
              </button>
              <button className="btn-primary" onClick={submitSale}>
                Record Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
