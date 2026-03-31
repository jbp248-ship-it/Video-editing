"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { StatsGrid } from "@/components/StatsGrid";
import { InventoryTable } from "@/components/InventoryTable";
import { AlertPanel } from "@/components/AlertPanel";
import { PriceTrendChart } from "@/components/PriceTrendChart";
import { MarketScanner } from "@/components/MarketScanner";
import { TicketBrowser } from "@/components/TicketBrowser";
import type { DashboardStats } from "@/types";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [inventory, setInventory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
    setAlerts((prev: { id: string }[]) =>
      prev.filter((a) => !ids.includes(a.id))
    );
    setAlertCount((c) => Math.max(0, c - ids.length));
  };

  const handleMarkRead = async (ids: string[]) => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "read" }),
    });
    setAlerts((prev: { id: string; read: boolean }[]) =>
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
                {["ALL", "IN_HAND", "LISTED", "PENDING_REMOVAL", "SOLD"].map(
                  (s) => (
                    <button key={s} className="btn-ghost text-xs">
                      {s.replace(/_/g, " ")}
                    </button>
                  )
                )}
              </div>
              <InventoryTable
                items={inventory}
                onRecordSale={handleRecordSale}
              />
            </>
          )}

          {/* Sales View */}
          {activeTab === "sales" && (
            <div className="card text-center py-12 text-warm-500">
              Sales history will appear here once you record your first sale.
            </div>
          )}

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
          {activeTab === "settings" && (
            <div className="card max-w-2xl space-y-6">
              <h2 className="text-lg font-semibold text-warm-900">Fee Configuration</h2>
              <p className="text-sm text-warm-500">
                Adjust platform fee percentages to match your seller tier.
              </p>
              <div className="space-y-3">
                {[
                  { name: "StubHub", fee: "15%" },
                  { name: "Ticketmaster", fee: "12% + 3% processing" },
                  { name: "Vivid Seats", fee: "10%" },
                  { name: "SeatGeek", fee: "12%" },
                  { name: "Etix", fee: "10% + 2% processing" },
                ].map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between py-2 border-b border-warm-200"
                  >
                    <span className="font-medium text-warm-900">{p.name}</span>
                    <span className="text-sm text-warm-500">{p.fee}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
