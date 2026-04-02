"use client";

import { useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { TicketBrowser } from "./TicketBrowser";
import { MarketScanner } from "./MarketScanner";
import { VelocityChart } from "./VelocityChart";
import { FlareScreener } from "./FlareScreener";
import { PredictionsPanel } from "./PredictionsPanel";

const SUB_TABS = [
  { id: "browse", label: "Browse Sites" },
  { id: "scan", label: "Market Scanner" },
  { id: "demand", label: "Supply & Demand" },
  { id: "flare", label: "FLARE Screener" },
  { id: "predictions", label: "Predictions" },
];

function TabErrorFallback({ tabName }: { tabName: string }) {
  return (
    <div
      style={{
        padding: "24px",
        textAlign: "center",
        backgroundColor: "#FEF2F2",
        border: "1px solid #FECACA",
        borderRadius: "8px",
        color: "#991b1b",
        fontSize: "14px",
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: "4px" }}>
        {tabName} failed to load
      </p>
      <p style={{ color: "#78716C", fontSize: "13px" }}>
        Try refreshing the page. If the problem persists, check the console for details.
      </p>
    </div>
  );
}

export function MarketIntel() {
  const [subTab, setSubTab] = useState("browse");

  return (
    <div>
      {/* Sub-tab bar — clean horizontal pills */}
      <div className="flex items-center gap-1 mb-4 p-1 bg-warm-100 rounded-lg w-fit">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`px-4 py-1.5 text-sm rounded-md transition-all ${
              subTab === tab.id
                ? "bg-white text-warm-900 shadow-sm font-medium"
                : "text-warm-500 hover:text-warm-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content — each sub-component wrapped in ErrorBoundary */}
      {subTab === "browse" && (
        <ErrorBoundary fallback={<TabErrorFallback tabName="Ticket Browser" />}>
          <TicketBrowser />
        </ErrorBoundary>
      )}
      {subTab === "scan" && (
        <ErrorBoundary fallback={<TabErrorFallback tabName="Market Scanner" />}>
          <MarketScanner />
        </ErrorBoundary>
      )}
      {subTab === "demand" && (
        <ErrorBoundary fallback={<TabErrorFallback tabName="Supply & Demand" />}>
          <VelocityChart />
        </ErrorBoundary>
      )}
      {subTab === "flare" && (
        <ErrorBoundary fallback={<TabErrorFallback tabName="FLARE Screener" />}>
          <FlareScreener />
        </ErrorBoundary>
      )}
      {subTab === "predictions" && (
        <ErrorBoundary fallback={<TabErrorFallback tabName="Predictions" />}>
          <PredictionsPanel />
        </ErrorBoundary>
      )}
    </div>
  );
}
