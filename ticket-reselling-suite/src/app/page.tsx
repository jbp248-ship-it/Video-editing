"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { StatsGrid } from "@/components/StatsGrid";
import { InventoryTable } from "@/components/InventoryTable";
import { AlertPanel } from "@/components/AlertPanel";
import { PriceTrendChart } from "@/components/PriceTrendChart";
import type { DashboardStats } from "@/types";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [inventory, setInventory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [alertCount, setAlertCount] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, invRes, alertRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/inventory"),
        fetch("/api/alerts"),
      ]);

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        setStats(dashData);
        setAlertCount(dashData.unreadAlerts ?? 0);
      }
      if (invRes.ok) setInventory(await invRes.json());
      if (alertRes.ok) setAlerts(await alertRes.json());
    } catch {
      // Silently fail — dashboard will show loading state
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds for near-real-time updates
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRecordSale = (inventoryId: string) => {
    // In production, this opens a modal. Placeholder for now.
    console.log("Record sale for:", inventoryId);
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        alertCount={alertCount}
      />

      <main className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-700 bg-slate-900/80 backdrop-blur px-6">
          <h1 className="text-lg font-semibold capitalize">
            {activeTab === "market" ? "Market Intelligence" : activeTab}
          </h1>
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Search events..."
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 placeholder-slate-500 focus:border-sky-500 focus:outline-none w-64"
            />
            <button className="btn-primary">+ Add Tickets</button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* ─── Dashboard View ──────────────────────────────── */}
          {activeTab === "dashboard" && (
            <>
              <StatsGrid stats={stats} />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Alerts panel */}
                <div className="lg:col-span-1">
                  <h2 className="text-sm font-medium text-slate-400 mb-3">
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
                  <h2 className="text-sm font-medium text-slate-400 mb-3">
                    Market Overview
                  </h2>
                  <PriceTrendChart data={snapshots} />
                </div>
              </div>

              {/* Quick inventory view */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-slate-400">
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

          {/* ─── Inventory View ─────────────────────────────── */}
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

          {/* ─── Sales View ─────────────────────────────────── */}
          {activeTab === "sales" && (
            <div className="card text-center py-12 text-slate-400">
              Sales history will appear here once you record your first sale.
            </div>
          )}

          {/* ─── Market Intel View ──────────────────────────── */}
          {activeTab === "market" && (
            <>
              <p className="text-sm text-slate-400">
                Use the Chrome extension to capture market snapshots. Price
                trends will appear below.
              </p>
              <PriceTrendChart data={snapshots} title="All Events — Get-In Price Trend" />
            </>
          )}

          {/* ─── Alerts View ────────────────────────────────── */}
          {activeTab === "alerts" && (
            <AlertPanel
              alerts={alerts}
              onDismiss={handleDismissAlerts}
              onMarkRead={handleMarkRead}
            />
          )}

          {/* ─── Settings View ──────────────────────────────── */}
          {activeTab === "settings" && (
            <div className="card max-w-2xl space-y-6">
              <h2 className="text-lg font-semibold">Fee Configuration</h2>
              <p className="text-sm text-slate-400">
                Adjust platform fee percentages to match your seller tier.
              </p>
              <div className="space-y-3">
                {[
                  { name: "StubHub", fee: "15%" },
                  { name: "Ticketmaster", fee: "12% + 3% processing" },
                  { name: "Vivid Seats", fee: "10%" },
                  { name: "SeatGeek", fee: "12%" },
                ].map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between py-2 border-b border-slate-700"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-sm text-slate-400">{p.fee}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
