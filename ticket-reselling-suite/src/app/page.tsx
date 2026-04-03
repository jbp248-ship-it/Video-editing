"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { InventoryTable } from "@/components/InventoryTable";
import { AlertPanel } from "@/components/AlertPanel";
import { SalesHistory } from "@/components/SalesHistory";
import { CSVImport } from "@/components/CSVImport";

// ─── Placeholder for UnifiedSearch (will be created by another agent) ────────
function UnifiedSearch() {
  return (
    <div className="card p-8 text-center text-warm-500">
      Search coming soon...
    </div>
  );
}

// ─── Simple Dashboard ────────────────────────────────────────────────────────
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-warm-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-warm-900">{value}</p>
    </div>
  );
}

function SimpleDashboard({
  inventory,
  alerts,
  onRecordSale,
}: {
  inventory: any[];
  alerts: any[];
  onRecordSale: (id: string) => void;
}) {
  const activeTickets = inventory.filter(
    (i: any) => i.status === "IN_HAND" || i.status === "LISTED"
  );
  const totalInvested = activeTickets.reduce(
    (s: number, i: any) => s + (i.purchasePrice ?? 0) * (i.quantity ?? 0),
    0
  );
  const totalListed = activeTickets.filter(
    (i: any) => i.status === "LISTED"
  ).length;
  const unreadAlerts = alerts.filter((a: any) => !a.read);

  return (
    <div className="space-y-6">
      {/* 4 stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Active Tickets"
          value={String(
            activeTickets.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0)
          )}
        />
        <StatCard label="Total Invested" value={`$${totalInvested.toFixed(2)}`} />
        <StatCard label="Listed" value={String(totalListed)} />
        <StatCard label="Unread Alerts" value={String(unreadAlerts.length)} />
      </div>

      {/* Recent alerts */}
      {unreadAlerts.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-warm-900 mb-3">
            Recent Alerts
          </h3>
          <div className="space-y-2">
            {unreadAlerts.slice(0, 3).map((a: any) => (
              <div
                key={a.id}
                className="text-sm text-warm-700 py-1 border-b border-warm-100 last:border-0"
              >
                {a.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick inventory preview */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-warm-900 mb-3">
          Your Tickets
        </h3>
        {activeTickets.length > 0 ? (
          <InventoryTable
            items={activeTickets.slice(0, 5)}
            onRecordSale={onRecordSale}
          />
        ) : (
          <p className="text-sm text-warm-400">No active tickets yet.</p>
        )}
      </div>
    </div>
  );
}

// ─── Platform fee defaults ───────────────────────────────────────────────────
const PLATFORM_FEES: { key: string; label: string; defaultFee: number }[] = [
  { key: "fee_STUBHUB", label: "StubHub", defaultFee: 15 },
  { key: "fee_TICKETMASTER", label: "Ticketmaster", defaultFee: 12 },
  { key: "fee_VIVID_SEATS", label: "Vivid Seats", defaultFee: 10 },
  { key: "fee_SEATGEEK", label: "SeatGeek", defaultFee: 12 },
  { key: "fee_ETIX", label: "Etix", defaultFee: 10 },
  { key: "fee_AXS", label: "AXS", defaultFee: 10 },
  { key: "fee_TICKPICK", label: "TickPick", defaultFee: 10 },
  { key: "fee_GAMETIME", label: "Gametime", defaultFee: 10 },
];

// ─── Settings Panel ──────────────────────────────────────────────────────────
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

  // ── Update state ──
  const [updateStatus, setUpdateStatus] = useState<string>("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);

  const checkForUpdate = async () => {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const w = window as any;
      const result = await w.ticketOps?.checkUpdate?.();
      if (result?.available) {
        setUpdateStatus("available");
      } else if (result?.error) {
        setUpdateError(result.error);
        setUpdateStatus("error");
      } else {
        setUpdateStatus("idle");
      }
    } catch {
      setUpdateStatus("error");
      setUpdateError("Could not check for updates");
    }
  };

  const installUpdate = async () => {
    setUpdateStatus("updating");
    setUpdateError(null);
    try {
      const w = window as any;
      const result = await w.ticketOps?.installUpdate?.();
      if (result?.success) {
        setUpdateStatus("done");
      } else {
        setUpdateError(result?.error ?? "Update failed");
        setUpdateStatus("error");
      }
    } catch {
      setUpdateStatus("error");
      setUpdateError("Update failed");
    }
  };

  const restartApp = () => {
    const w = window as any;
    w.ticketOps?.restartApp?.();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ── Update Section ── */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-warm-900">App Updates</h2>
        <p className="text-sm text-warm-500">
          Check for the latest features and bug fixes.
        </p>
        <div className="flex items-center gap-3">
          {updateStatus === "idle" && (
            <button className="btn-primary" onClick={checkForUpdate}>
              Check for Updates
            </button>
          )}
          {updateStatus === "checking" && (
            <button className="btn-ghost" disabled>
              Checking...
            </button>
          )}
          {updateStatus === "available" && (
            <button className="btn-primary" onClick={installUpdate}>
              Download &amp; Install Update
            </button>
          )}
          {updateStatus === "updating" && (
            <button className="btn-ghost" disabled>
              Updating... please wait
            </button>
          )}
          {updateStatus === "done" && (
            <button className="btn-primary" onClick={restartApp}>
              Restart to Apply Update
            </button>
          )}
          {updateStatus === "error" && (
            <>
              <button className="btn-primary" onClick={checkForUpdate}>
                Retry
              </button>
              {updateError && (
                <span className="text-xs text-red-600">{updateError}</span>
              )}
            </>
          )}
          {updateStatus === "idle" && (
            <span className="text-xs text-green-600">
              You&apos;re up to date
            </span>
          )}
        </div>
        {updateStatus === "done" && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            Update downloaded! Click &quot;Restart to Apply Update&quot; to use
            the latest version.
          </div>
        )}
      </div>

      {/* ── Fee Configuration ── */}
      <div className="card space-y-6">
        <h2 className="text-lg font-semibold text-warm-900">
          Fee Configuration
        </h2>
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
                {savedKeys[p.key]
                  ? "Saved!"
                  : saving[p.key]
                    ? "Saving\u2026"
                    : "Save"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab titles ──────────────────────────────────────────────────────────────
const TAB_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  search: "Search",
  inventory: "My Tickets",
  settings: "Settings",
};

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const handleTabChange = useCallback(
    (tab: string) => {
      if (activeTab !== tab) {
        try {
          const w = window as any;
          w.ticketOps?.closeBrowser?.();
        } catch {}
      }
      setActiveTab(tab);
    },
    [activeTab]
  );

  const [inventory, setInventory] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
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
  const [showImport, setShowImport] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, invRes, alertRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/inventory"),
        fetch("/api/alerts"),
      ]);

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        setAlertCount(dashData.unreadAlerts ?? 0);
      }
      if (invRes.ok) setInventory(await invRes.json());
      if (alertRes.ok) setAlerts(await alertRes.json());
      fetch("/api/alerts/floor-check", { method: "POST" }).catch(() => {});
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
        onTabChange={handleTabChange}
        alertCount={alertCount}
      />

      <main className="flex-1 overflow-y-auto">
        {/* Top Bar — clean, no search bar */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-warm-200 bg-white/80 backdrop-blur px-6">
          <h1 className="text-lg font-semibold text-warm-900">
            {TAB_TITLES[activeTab] ?? activeTab}
          </h1>
          <div className="flex items-center gap-3">
            {alertCount > 0 && (
              <button
                className="relative btn-ghost text-xs"
                onClick={() => handleTabChange("dashboard")}
                title="View alerts on dashboard"
              >
                <svg
                  className="h-5 w-5 text-warm-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                </svg>
                <span
                  className="absolute -top-1 -right-1 rounded-full px-1 py-0.5 text-[9px] font-bold text-white leading-none"
                  style={{
                    backgroundColor: "#DC2626",
                    minWidth: "14px",
                    textAlign: "center",
                  }}
                >
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              </button>
            )}
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

          {/* Dashboard */}
          {activeTab === "dashboard" && (
            <SimpleDashboard
              inventory={inventory}
              alerts={alerts}
              onRecordSale={handleRecordSale}
            />
          )}

          {/* Search */}
          {activeTab === "search" && <UnifiedSearch />}

          {/* Inventory */}
          {activeTab === "inventory" && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {[
                    "ALL",
                    "IN_HAND",
                    "LISTED",
                    "PENDING_REMOVAL",
                    "SOLD",
                    "TRANSFERRED",
                    "EXPIRED",
                  ].map((s) => (
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
                  ))}
                </div>
                <button
                  className="btn-ghost text-xs"
                  onClick={() => setShowImport(!showImport)}
                >
                  {showImport ? "\u2190 Back to Inventory" : "\uD83D\uDCC4 Import CSV"}
                </button>
              </div>
              {showImport ? (
                <CSVImport />
              ) : (
                <InventoryTable
                  items={
                    inventoryFilter === "ALL"
                      ? inventory
                      : inventory.filter(
                          (item: any) => item.status === inventoryFilter
                        )
                  }
                  onRecordSale={handleRecordSale}
                />
              )}
              {/* Sales history below inventory */}
              <SalesHistory />
            </>
          )}

          {/* Settings */}
          {activeTab === "settings" && <SettingsPanel />}
        </div>
      </main>

      {/* Record Sale Modal */}
      {saleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/40 backdrop-blur-sm">
          <div className="card w-96 space-y-4 shadow-warm-lg">
            <h2 className="text-lg font-semibold text-warm-900">
              Record Sale
            </h2>
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
                  {[
                    "STUBHUB",
                    "TICKETMASTER",
                    "VIVID_SEATS",
                    "SEATGEEK",
                    "ETIX",
                    "AXS",
                    "TICKPICK",
                    "GAMETIME",
                  ].map((p) => (
                    <option key={p} value={p}>
                      {p.replace(/_/g, " ")}
                    </option>
                  ))}
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
