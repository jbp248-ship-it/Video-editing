"use client";

// Status badge mapping per design spec:
// IN_HAND = green (tickets in physical possession)
// LISTED = amber (actively listed on a marketplace)
// PENDING_SALE / SOLD = gray (completed)
// PENDING_REMOVAL = red (urgent action needed)
const STATUS_BADGES: Record<string, string> = {
  IN_HAND: "badge-green",
  LISTED: "badge-amber",
  PENDING_SALE: "badge-yellow",
  SOLD: "badge-gray",
  PENDING_REMOVAL: "badge-red",
  TRANSFERRED: "badge-gray",
  EXPIRED: "badge-gray",
};

const STATUS_LABELS: Record<string, string> = {
  IN_HAND: "In Hand",
  LISTED: "Listed",
  PENDING_SALE: "Pending Sale",
  SOLD: "Sold",
  PENDING_REMOVAL: "Remove Now",
  TRANSFERRED: "Transferred",
  EXPIRED: "Expired",
};

interface InventoryItem {
  id: string;
  section: string;
  row: string;
  seatFrom: number;
  seatTo: number;
  quantity: number;
  purchasePrice: number | string;
  listPrice: number | string | null;
  listPlatform: string | null;
  status: string;
  event: {
    name: string;
    venue: string;
    eventDate: string;
  };
}

interface InventoryTableProps {
  items: InventoryItem[];
  onRecordSale: (id: string) => void;
}

function formatCurrency(n: number | string | null): string {
  if (n === null || n === undefined) return "\u2014";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InventoryTable({ items, onRecordSale }: InventoryTableProps) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">🎫</span>
        <p className="empty-state-title">No inventory yet</p>
        <p className="empty-state-body">
          Add your first tickets to start tracking your inventory.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="px-4 py-3 font-semibold">Event</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Section / Row</th>
              <th className="px-4 py-3 font-semibold">Seats</th>
              <th className="px-4 py-3 font-semibold text-right">Qty</th>
              <th className="px-4 py-3 font-semibold text-right">Cost / Ticket</th>
              <th className="px-4 py-3 font-semibold text-right">List Price</th>
              <th className="px-4 py-3 font-semibold">Platform</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const costPerTicket =
                item.quantity > 0
                  ? parseFloat(String(item.purchasePrice)) / item.quantity
                  : 0;
              const listNum = item.listPrice
                ? parseFloat(String(item.listPrice))
                : null;
              const margin =
                listNum && costPerTicket
                  ? (((listNum - costPerTicket) / costPerTicket) * 100).toFixed(1)
                  : null;
              const marginPositive = margin ? parseFloat(margin) >= 0 : false;
              const isPendingRemoval = item.status === "PENDING_REMOVAL";

              return (
                <tr
                  key={item.id}
                  className="table-row"
                  style={isPendingRemoval ? { backgroundColor: "rgba(220, 38, 38, 0.03)" } : undefined}
                >
                  <td className="px-4 py-3 font-medium max-w-[200px]">
                    <span
                      className="block truncate text-warm-900"
                      title={item.event?.name ?? "Unknown"}
                    >
                      {item.event?.name ?? "Unknown"}
                    </span>
                    <span className="block text-xs text-warm-400 truncate mt-0.5" title={item.event?.venue ?? ""}>
                      {item.event?.venue ?? ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-warm-500 whitespace-nowrap text-xs">
                    {item.event?.eventDate ? formatDate(item.event.eventDate) : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-warm-700 whitespace-nowrap">
                    <span className="font-medium">{item.section}</span>
                    <span className="text-warm-400 mx-1">/</span>
                    <span>{item.row}</span>
                  </td>
                  <td className="px-4 py-3 text-warm-500 whitespace-nowrap text-xs">
                    {item.seatFrom}–{item.seatTo}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-warm-700">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-warm-700">
                    {formatCurrency(costPerTicket)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-xs text-warm-800">
                      {formatCurrency(item.listPrice)}
                    </span>
                    {margin && (
                      <span
                        className={`ml-1.5 text-xs font-medium ${
                          marginPositive ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {marginPositive ? "+" : ""}
                        {margin}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-warm-500">
                    {item.listPlatform ?? (
                      <span className="text-warm-300">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_BADGES[item.status] ?? "badge-gray"}>
                      {STATUS_LABELS[item.status] ?? item.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {item.status === "LISTED" && (
                      <button
                        onClick={() => onRecordSale(item.id)}
                        className="rounded-md px-2.5 py-1 text-xs font-semibold transition-all duration-150"
                        style={{
                          backgroundColor: "rgba(217, 119, 6, 0.1)",
                          color: "#b45309",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "rgba(217, 119, 6, 0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "rgba(217, 119, 6, 0.1)";
                        }}
                      >
                        Mark as Sold
                      </button>
                    )}
                    {item.status === "IN_HAND" && (
                      <button
                        onClick={() => onRecordSale(item.id)}
                        className="rounded-md px-2.5 py-1 text-xs font-semibold transition-all duration-150"
                        style={{
                          backgroundColor: "rgba(217, 119, 6, 0.08)",
                          color: "#b45309",
                        }}
                      >
                        Mark as Sold
                      </button>
                    )}
                    {item.status === "PENDING_REMOVAL" && (
                      <span
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold animate-pulse"
                        style={{
                          backgroundColor: "rgba(220, 38, 38, 0.1)",
                          color: "#dc2626",
                        }}
                      >
                        <span>⚠</span> De-list Now
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
