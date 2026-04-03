/**
 * Lightweight JSON file database — no native modules, works on all platforms.
 * Stores data in data/resale.json next to this file.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', 'data');
const dbPath = join(dataDir, 'resale.json');

mkdirSync(dataDir, { recursive: true });

function load() {
  if (!existsSync(dbPath)) return { inventory: [], nextId: 1 };
  try {
    return JSON.parse(readFileSync(dbPath, 'utf-8'));
  } catch {
    return { inventory: [], nextId: 1 };
  }
}

function save(data) {
  writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

export const db = {
  // Return all inventory rows
  all() {
    return load().inventory.sort((a, b) =>
      (a.event_date || '').localeCompare(b.event_date || '')
    );
  },

  // Get one row by id
  get(id) {
    return load().inventory.find((r) => r.id === Number(id)) || null;
  },

  // Insert a new row, returns the inserted row
  insert(row) {
    const data = load();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const newRow = {
      id: data.nextId++,
      event_name: row.event_name || '',
      event_date: row.event_date || null,
      venue: row.venue || null,
      seat_location: row.seat_location || null,
      quantity: row.quantity || 1,
      purchase_price: row.purchase_price || 0,
      current_value: row.current_value || null,
      sold_price: row.sold_price || null,
      sold_at: row.sold_at || null,
      seatgeek_event_id: row.seatgeek_event_id || null,
      created_at: now,
      updated_at: now,
    };
    data.inventory.push(newRow);
    save(data);
    return newRow;
  },

  // Update fields on a row by id, returns updated row
  update(id, fields) {
    const data = load();
    const idx = data.inventory.findIndex((r) => r.id === Number(id));
    if (idx === -1) return null;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    data.inventory[idx] = { ...data.inventory[idx], ...fields, updated_at: now };
    save(data);
    return data.inventory[idx];
  },

  // Delete a row by id
  delete(id) {
    const data = load();
    const idx = data.inventory.findIndex((r) => r.id === Number(id));
    if (idx === -1) return false;
    data.inventory.splice(idx, 1);
    save(data);
    return true;
  },

  // Compute summary stats
  summary() {
    const rows = load().inventory;
    const unsold = rows.filter((r) => !r.sold_price);
    const sold = rows.filter((r) => r.sold_price);

    const totalInvested = unsold.reduce((s, r) => s + (r.purchase_price || 0) * (r.quantity || 1), 0);
    const currentValue = unsold.reduce((s, r) => s + (r.current_value || r.purchase_price || 0) * (r.quantity || 1), 0);
    const realizedProfit = sold.reduce((s, r) => s + ((r.sold_price || 0) - (r.purchase_price || 0)) * (r.quantity || 1), 0);

    return {
      totalInvested,
      currentValue,
      realizedProfit,
      totalItems: rows.length,
      soldItems: sold.length,
    };
  },
};
