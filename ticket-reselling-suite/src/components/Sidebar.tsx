"use client";

import { useState } from "react";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "browse", label: "Browse Sites", icon: "🌐" },
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
      className={`flex flex-col border-r transition-all ${
        collapsed ? "w-16" : "w-56"
      }`}
      style={{
        backgroundColor: "#3D3929",
        borderColor: "#4A4539",
      }}
    >
      {/* Header */}
      <div
        className="flex h-16 items-center justify-between px-4 border-b"
        style={{ borderColor: "#4A4539" }}
      >
        {!collapsed && (
          <span
            className="text-lg font-bold"
            style={{ color: "#F59E0B" }}
          >
            TicketOps
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="transition-colors"
          style={{ color: "#A89F91" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F0EB")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#A89F91")}
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
                ? "border-r-2"
                : ""
            }`}
            style={
              activeTab === item.id
                ? {
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                    color: "#F59E0B",
                    borderColor: "#F59E0B",
                  }
                : {
                    color: "#A89F91",
                  }
            }
            onMouseEnter={(e) => {
              if (activeTab !== item.id) {
                e.currentTarget.style.color = "#F5F0EB";
                e.currentTarget.style.backgroundColor = "rgba(245, 240, 235, 0.08)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== item.id) {
                e.currentTarget.style.color = "#A89F91";
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
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
