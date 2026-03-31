"use client";

import { useState } from "react";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "inventory", label: "Inventory", icon: "🎫" },
  { id: "sales", label: "Sales", icon: "💰" },
  { id: "market", label: "Market Scanner", icon: "🔍" },
  { id: "alerts", label: "Alerts", icon: "🔔" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  alertCount: number;
}

export function Sidebar({ activeTab, onTabChange, alertCount }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col border-r border-slate-700 bg-slate-900 transition-all ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-700">
        {!collapsed && (
          <span className="text-lg font-bold text-sky-400">TicketOps</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-slate-400 hover:text-white"
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
              activeTab === item.id
                ? "bg-sky-600/20 text-sky-400 border-r-2 border-sky-400"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {!collapsed && (
              <span className="flex-1 text-left">{item.label}</span>
            )}
            {!collapsed && item.id === "alerts" && alertCount > 0 && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                {alertCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}
