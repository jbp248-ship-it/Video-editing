"use client";

import { useState } from "react";

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    id: "search",
    label: "Search",
    icon: (
      <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "inventory",
    label: "My Tickets",
    icon: (
      <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
      </svg>
    ),
  },
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
      className="flex flex-col border-r transition-all duration-200"
      style={{
        width: collapsed ? "60px" : "224px",
        minWidth: collapsed ? "60px" : "224px",
        backgroundColor: "#3D3929",
        borderColor: "#4A4539",
      }}
    >
      {/* Header / Logo */}
      <div
        className="flex h-14 items-center justify-between shrink-0 border-b"
        style={{ borderColor: "#4A4539", padding: collapsed ? "0 0 0 18px" : "0 12px 0 16px" }}
      >
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: "#D97706" }}
            >
              <svg
                className="h-4 w-4 text-white"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <span
              className="text-base font-bold tracking-tight truncate"
              style={{ color: "#F5F0EB" }}
            >
              Ticket<span style={{ color: "#F59E0B" }}>Reselling</span>
            </span>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 shrink-0"
          style={{ color: "#6B6560" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(245,240,235,0.1)";
            e.currentTarget.style.color = "#A89F91";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "#6B6560";
          }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg
            className="h-4 w-4 transition-transform duration-200"
            style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="flex w-full items-center gap-3 py-2.5 text-sm transition-all duration-150 relative"
              style={{
                padding: collapsed ? "10px 0" : "10px 16px",
                justifyContent: collapsed ? "center" : "flex-start",
                backgroundColor: isActive
                  ? "rgba(245, 158, 11, 0.12)"
                  : "transparent",
                color: isActive ? "#F59E0B" : "#8C8680",
                borderRight: isActive ? "2px solid #F59E0B" : "2px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "rgba(245,240,235,0.07)";
                  e.currentTarget.style.color = "#D4CAC0";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "#8C8680";
                }
              }}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0 transition-transform duration-150">
                {item.icon}
              </span>

              {!collapsed && (
                <span className="flex-1 text-left font-medium truncate">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer -- bell badge + version */}
      <div
        className="shrink-0 border-t"
        style={{ borderColor: "#4A4539" }}
      >
        {/* Notification bell (badge only, not a tab) */}
        <button
          onClick={() => onTabChange("dashboard")}
          className="flex w-full items-center gap-3 py-2.5 text-sm transition-all duration-150 relative"
          style={{
            padding: collapsed ? "10px 0" : "10px 16px",
            justifyContent: collapsed ? "center" : "flex-start",
            backgroundColor: "transparent",
            color: "#8C8680",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(245,240,235,0.07)";
            e.currentTarget.style.color = "#D4CAC0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "#8C8680";
          }}
          title="Alerts"
        >
          <span className="shrink-0 relative">
            <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
            {alertCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 rounded-full px-1 py-0.5 text-[9px] font-bold text-white leading-none"
                style={{
                  backgroundColor: "#DC2626",
                  minWidth: "16px",
                  textAlign: "center",
                }}
              >
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </span>
          {!collapsed && (
            <span className="flex-1 text-left font-medium truncate">
              Alerts
            </span>
          )}
        </button>

        {/* Version */}
        {!collapsed && (
          <div className="px-4 py-3">
            <p className="text-[10px] font-medium" style={{ color: "#4A4539" }}>
              TicketReselling v1.0
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
