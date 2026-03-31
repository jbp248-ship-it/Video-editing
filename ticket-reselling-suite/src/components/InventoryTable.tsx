"use client";

const STATUS_BADGES: Record<string, string> = {
  IN_HAND: "badge-blue",
  LISTED: "badge-green",
  PENDING_SALE: "badge-yellow",
  SOLD: "badge-gray",
  PENDING_REMOVAL: "badge-red",
  TRANSFERRED: "badge-gray",
  EXPIRED: "badge-gray",
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
      <div className="card text-center py-12 text-warm-500">
        No inventory items yet. Add your first tickets to get started.
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-warm-200 text-left text-xs uppercase text-warm-500">
            <th className="px-4 py-3">Event</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Section</th>
            <th className="px-4 py-3">Seats</th>
            <th className="px-4 py-3">Qty</th>
            <th className="px-4 py-3">Cost</th>
            <th className="px-4 py-3">List Price</th>
            <th className="px-4 py-3">Platform</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Actions</th>
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

            return (
              <tr key={item.id} className="table-row">
                <td className="px-4 py-3 font-medium max-w-[200px] truncate text-warm-900">
                  {item.event.name}
                </td>
                <td className="px-4 py-3 text-warm-500 whitespace-nowrap">
                  {formatDate(item.event.eventDate)}
                </td>
                <td className="px-4 py-3">
                  {item.section} / {item.row}
                </td>
                <td className="px-4 py-3">
                  {item.seatFrom}-{item.seatTo}
                </td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{formatCurrency(costPerTicket)}</td>
                <td className="px-4 py-3">
                  {formatCurrency(item.listPrice)}
                  {margin && (
                    <span
                      className={`ml-1 text-xs ${
                        parseFloat(margin) >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      ({margin}%)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {item.listPlatform ?? "\u2014"}
                </td>
                <td className="px-4 py-3">
                  <span className={STATUS_BADGES[item.status] ?? "badge-gray"}>
                    {item.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {item.status === "LISTED" && (
                    <button
                      onClick={() => onRecordSale(item.id)}
                      className="text-xs text-brand-500 hover:text-brand-600 font-medium"
                    >
                      Record Sale
                    </button>
                  )}
                  {item.status === "PENDING_REMOVAL" && (
                    <span className="text-xs text-red-600 font-semibold animate-pulse">
                      DE-LIST NOW
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
