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

const ALERT_CONFIG: Record<
  string,
  { borderColor: string; iconBg: string; icon: string; label: string }
> = {
  DOUBLE_SELL_RISK: {
    borderColor: "#dc2626",
    iconBg: "rgba(220,38,38,0.1)",
    icon: "🚨",
    label: "Double-Sell Risk",
  },
  LOW_INVENTORY: {
    borderColor: "#d97706",
    iconBg: "rgba(217,119,6,0.1)",
    icon: "⚠️",
    label: "Low Inventory",
  },
  HIGH_MARGIN: {
    borderColor: "#16a34a",
    iconBg: "rgba(22,163,74,0.1)",
    icon: "💎",
    label: "High Margin",
  },
  PRICE_DROP: {
    borderColor: "#ea580c",
    iconBg: "rgba(234,88,12,0.1)",
    icon: "📉",
    label: "Price Drop",
  },
  APPROACHING_EVENT: {
    borderColor: "#D97706",
    iconBg: "rgba(217,119,6,0.1)",
    icon: "📅",
    label: "Approaching Event",
  },
};

const DEFAULT_ALERT_CONFIG = {
  borderColor: "#A89F91",
  iconBg: "rgba(140,134,128,0.1)",
  icon: "ℹ️",
  label: "Info",
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
  const unreadCount = alerts.filter((a) => !a.read).length;

  if (alerts.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">✅</span>
        <p className="empty-state-title">All clear</p>
        <p className="empty-state-body">No active alerts. You&apos;re in good shape.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="section-label">
            {alerts.length} Alert{alerts.length !== 1 ? "s" : ""}
          </h3>
          {unreadCount > 0 && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
              style={{ backgroundColor: "#D97706" }}
            >
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() =>
                onMarkRead(alerts.filter((a) => !a.read).map((a) => a.id))
              }
              className="btn-ghost text-xs py-1 px-2"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={() => onDismiss(alerts.map((a) => a.id))}
            className="btn-ghost text-xs py-1 px-2"
          >
            Dismiss all
          </button>
        </div>
      </div>

      {/* Alert list */}
      {alerts.map((alert) => {
        const config = ALERT_CONFIG[alert.type] ?? DEFAULT_ALERT_CONFIG;
        const isUnread = !alert.read;

        return (
          <div
            key={alert.id}
            className={isUnread ? "alert-card-unread" : "alert-card-read"}
            style={{
              borderLeftColor: isUnread ? config.borderColor : "#C4BBB0",
              cursor: isUnread ? "pointer" : "default",
            }}
            onClick={() => isUnread && onMarkRead([alert.id])}
          >
            <div className="flex items-start gap-3">
              {/* Icon bubble */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
                style={{ backgroundColor: config.iconBg }}
              >
                {config.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-warm-900">
                    {alert.title}
                  </span>
                  {isUnread && (
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: "#D97706" }}
                    />
                  )}
                </div>
                <p className="text-sm text-warm-500 mt-0.5 leading-snug">
                  {alert.message}
                </p>
                <span className="text-xs text-warm-300 mt-1.5 block">
                  {timeAgo(alert.createdAt)}
                </span>
              </div>

              {/* Dismiss button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss([alert.id]);
                }}
                className="shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-warm-300 transition-all duration-150"
                style={{ fontSize: "12px" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(220,38,38,0.08)";
                  e.currentTarget.style.color = "#dc2626";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "";
                }}
                aria-label="Dismiss alert"
                title="Dismiss"
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
