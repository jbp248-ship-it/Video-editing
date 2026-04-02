"use client";

import { StatsGrid } from "./StatsGrid";
import { InventoryTable } from "./InventoryTable";
import { AlertPanel } from "./AlertPanel";
import { PriceTrendChart } from "./PriceTrendChart";

interface EnhancedDashboardProps {
  snapshots: any[];
  inventory: any[];
  alerts: any[];
  onRecordSale: (inventoryId: string) => void;
  onNavigate: (tab: string) => void;
  onDismissAlerts: (ids: string[]) => void;
  onMarkRead: (ids: string[]) => void;
}

export function EnhancedDashboard({
  snapshots,
  inventory,
  alerts,
  onRecordSale,
  onNavigate,
  onDismissAlerts,
  onMarkRead,
}: EnhancedDashboardProps) {
  return (
    <>
      <StatsGrid stats={null} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts panel */}
        <div className="lg:col-span-1">
          <h2 className="text-sm font-medium text-warm-500 mb-3">
            Active Alerts
          </h2>
          <AlertPanel
            alerts={alerts}
            onDismiss={onDismissAlerts}
            onMarkRead={onMarkRead}
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
            onClick={() => onNavigate("inventory")}
          >
            View All →
          </button>
        </div>
        <InventoryTable
          items={inventory}
          onRecordSale={onRecordSale}
        />
      </div>
    </>
  );
}
