"use client";

interface AlertItem {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

interface AlertPanelProps {
  alerts: AlertItem[];
  onDismiss: (ids: string[]) => void;
  onMarkRead: (ids: string[]) => void;
}

const ALERT_STYLES: Record<string, { border: string; icon: string }> = {
  DOUBLE_SELL_RISK: { border: "border-l-red-500", icon: "🚨" },
  LOW_INVENTORY: { border: "border-l-yellow-500", icon: "⚠️" },
  HIGH_MARGIN: { border: "border-l-green-500", icon: "💎" },
  PRICE_DROP: { border: "border-l-orange-500", icon: "📉" },
  APPROACHING_EVENT: { border: "border-l-sky-500", icon: "📅" },
};

function timeAgo(date: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function AlertPanel({ alerts, onDismiss, onMarkRead }: AlertPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="card text-center py-8 text-slate-400">
        No active alerts. You&#39;re all clear.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-400">
          {alerts.length} Active Alert{alerts.length !== 1 ? "s" : ""}
        </h3>
        <button
          onClick={() => onDismiss(alerts.map((a) => a.id))}
          className="btn-ghost text-xs"
        >
          Dismiss All
        </button>
      </div>

      {alerts.map((alert) => {
        const style = ALERT_STYLES[alert.type] ?? {
          border: "border-l-slate-500",
          icon: "ℹ️",
        };

        return (
          <div
            key={alert.id}
            className={`card border-l-4 ${style.border} ${
              !alert.read ? "bg-slate-800" : "bg-slate-800/50"
            }`}
            onClick={() => !alert.read && onMarkRead([alert.id])}
          >
            <div className="flex items-start gap-3">
              <span className="text-lg">{style.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{alert.title}</span>
                  {!alert.read && (
                    <span className="h-2 w-2 rounded-full bg-sky-400" />
                  )}
                </div>
                <p className="text-sm text-slate-400 mt-1">{alert.message}</p>
                <span className="text-xs text-slate-500 mt-2 block">
                  {timeAgo(alert.createdAt)}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss([alert.id]);
                }}
                className="text-slate-500 hover:text-slate-300 text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
