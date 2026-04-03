import { useState } from 'react';
import { Package, Plus, X } from 'lucide-react';
import InventoryRow from '../components/InventoryRow';
import { useInventory } from '../hooks/useInventory';
import { useMarketData } from '../hooks/useMarketData';
import { formatCurrency } from '../lib/format';

function AddTicketForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({
    event_name: '',
    event_date: '',
    venue: '',
    seat_location: '',
    quantity: 1,
    purchase_price: '',
    seatgeek_event_id: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      quantity: parseInt(form.quantity, 10) || 1,
      purchase_price: parseFloat(form.purchase_price) || 0,
      seatgeek_event_id: form.seatgeek_event_id || null,
    });
  };

  const inputClass =
    'w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 font-mono';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-800 border border-slate-700 rounded-lg w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-100">Add Ticket</h2>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Event Name *</label>
            <input
              name="event_name"
              value={form.event_name}
              onChange={handleChange}
              required
              placeholder="e.g. Taylor Swift - Eras Tour"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Event Date *</label>
              <input
                name="event_date"
                type="date"
                value={form.event_date}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Venue</label>
              <input
                name="venue"
                value={form.venue}
                onChange={handleChange}
                placeholder="e.g. Madison Square Garden"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Seat Location</label>
              <input
                name="seat_location"
                value={form.seat_location}
                onChange={handleChange}
                placeholder="e.g. Sec 101 Row A"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Quantity *</label>
              <input
                name="quantity"
                type="number"
                min="1"
                value={form.quantity}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cost per Ticket *</label>
              <input
                name="purchase_price"
                type="number"
                min="0"
                step="0.01"
                value={form.purchase_price}
                onChange={handleChange}
                required
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              SeatGeek Event ID (optional)
            </label>
            <input
              name="seatgeek_event_id"
              value={form.seatgeek_event_id}
              onChange={handleChange}
              placeholder="For live price tracking"
              className={inputClass}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 px-4 bg-slate-700 hover:bg-slate-600 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-sm font-medium rounded-lg transition-colors"
            >
              Add Ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SellForm({ item, onSubmit, onCancel }) {
  const [soldPrice, setSoldPrice] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(item.id, parseFloat(soldPrice));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-800 border border-slate-700 rounded-lg w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-100">Mark as Sold</h2>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-400 mb-3">{item.event_name}</p>
        <form onSubmit={handleSubmit}>
          <label className="block text-xs text-slate-400 mb-1">Sold Price per Ticket</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={soldPrice}
            onChange={(e) => setSoldPrice(e.target.value)}
            required
            placeholder="0.00"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-400 font-mono mb-4"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 px-4 bg-slate-700 hover:bg-slate-600 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-sm font-medium rounded-lg transition-colors"
            >
              Confirm Sale
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { items, summary, loading, error, addItem, deleteItem, markSold } = useInventory();
  const { refreshing } = useMarketData(items);
  const [showAddForm, setShowAddForm] = useState(false);
  const [sellItem, setSellItem] = useState(null);

  const handleAdd = async (data) => {
    try {
      await addItem(data);
      setShowAddForm(false);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleSell = async (id, soldPrice) => {
    try {
      await markSold(id, soldPrice);
      setSellItem(null);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      await deleteItem(id);
    }
  };

  const unrealizedPnL = summary.currentValue - summary.totalInvested + (summary.realizedProfit || 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-400" />
            My Inventory
          </h1>
          {refreshing && (
            <p className="text-xs text-slate-500 mt-1">Updating market prices...</p>
          )}
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Ticket
        </button>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-zinc-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-1">Total Items</p>
          <p className="text-xl font-bold text-slate-100">{summary.totalItems}</p>
        </div>
        <div className="bg-zinc-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-1">Total Invested</p>
          <p className="text-xl font-bold text-slate-100">{formatCurrency(summary.totalInvested)}</p>
        </div>
        <div className="bg-zinc-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-1">Current Value</p>
          <p className="text-xl font-bold text-slate-100">{formatCurrency(summary.currentValue)}</p>
        </div>
        <div className="bg-zinc-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-1">Unrealized P&L</p>
          <p
            className={`text-xl font-bold ${
              unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {unrealizedPnL >= 0 ? '+' : ''}
            {formatCurrency(unrealizedPnL)}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Loading inventory...</p>
          </div>
        </div>
      ) : items.length > 0 ? (
        <div className="bg-zinc-800 border border-slate-700 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_0.5fr_1fr_1fr_1fr_0.8fr_1fr] gap-2 px-4 py-3 bg-zinc-900 border-b border-slate-700 text-xs font-semibold text-slate-400 uppercase tracking-wide">
            <span>Event</span>
            <span>Date</span>
            <span>Seats</span>
            <span>Qty</span>
            <span>Cost/ea</span>
            <span>Value</span>
            <span>Gain/Loss</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-slate-700/50">
            {items.map((item) => (
              <InventoryRow
                key={item.id}
                item={item}
                onSell={(item) => setSellItem(item)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Package className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-lg">No tickets in inventory</p>
          <p className="text-sm mt-1">Click &quot;Add Ticket&quot; to start tracking</p>
        </div>
      )}

      {showAddForm && (
        <AddTicketForm
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {sellItem && (
        <SellForm
          item={sellItem}
          onSubmit={handleSell}
          onCancel={() => setSellItem(null)}
        />
      )}
    </div>
  );
}
