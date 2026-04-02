"use client";

import { useState } from "react";
import { TicketBrowser } from "./TicketBrowser";
import { MarketScanner } from "./MarketScanner";
import { VelocityChart } from "./VelocityChart";
import { FlareScreener } from "./FlareScreener";

const SUB_TABS = [
  { id: "browse", label: "Browse Sites" },
  { id: "scan", label: "Market Scanner" },
  { id: "demand", label: "Supply & Demand" },
  { id: "flare", label: "FLARE Screener" },
];

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

      {/* Content */}
      {subTab === "browse" && <TicketBrowser />}
      {subTab === "scan" && <MarketScanner />}
      {subTab === "demand" && <VelocityChart />}
      {subTab === "flare" && <FlareScreener />}
    </div>
  );
}
