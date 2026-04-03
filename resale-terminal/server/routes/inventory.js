import { Router } from 'express';
import db from '../db/connection.js';

const router = Router();

// GET /api/inventory — return all rows ordered by event_date
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM inventory ORDER BY event_date ASC').all();
    res.json(rows);
  } catch (err) {
    console.error('Error fetching inventory:', err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// GET /api/inventory/summary — return portfolio summary
router.get('/summary', (req, res) => {
  try {
    const totalInvested = db.prepare(
      `SELECT COALESCE(SUM(purchase_price * quantity), 0) AS value FROM inventory WHERE sold_at IS NULL`
    ).get().value;

    const currentValue = db.prepare(
      `SELECT COALESCE(SUM(COALESCE(current_value, purchase_price) * quantity), 0) AS value FROM inventory WHERE sold_at IS NULL`
    ).get().value;

    const realizedProfit = db.prepare(
      `SELECT COALESCE(SUM((sold_price - purchase_price) * quantity), 0) AS value FROM inventory WHERE sold_at IS NOT NULL`
    ).get().value;

    const totalItems = db.prepare(
      `SELECT COUNT(*) AS count FROM inventory`
    ).get().count;

    const soldItems = db.prepare(
      `SELECT COUNT(*) AS count FROM inventory WHERE sold_at IS NOT NULL`
    ).get().count;

    res.json({
      totalInvested,
      currentValue,
      realizedProfit,
      totalItems,
      soldItems,
    });
  } catch (err) {
    console.error('Error fetching summary:', err);
    res.status(500).json({ error: 'Failed to fetch inventory summary' });
  }
});

// POST /api/inventory — insert new item
router.post('/', (req, res) => {
  try {
    const { event_name, event_date, venue, seat_location, quantity, purchase_price, current_value, seatgeek_event_id } = req.body;

    if (!event_name || purchase_price == null) {
      return res.status(400).json({ error: 'event_name and purchase_price are required' });
    }

    const stmt = db.prepare(`
      INSERT INTO inventory (event_name, event_date, venue, seat_location, quantity, purchase_price, current_value, seatgeek_event_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      event_name,
      event_date || null,
      venue || null,
      seat_location || null,
      quantity || 1,
      purchase_price,
      current_value || null,
      seatgeek_event_id || null
    );

    const newItem = db.prepare('SELECT * FROM inventory WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newItem);
  } catch (err) {
    console.error('Error creating inventory item:', err);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

// PUT /api/inventory/:id — update any fields
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const fields = ['event_name', 'event_date', 'venue', 'seat_location', 'quantity', 'purchase_price', 'current_value', 'sold_price', 'sold_at', 'seatgeek_event_id'];
    const updates = [];
    const values = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE inventory SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating inventory item:', err);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// DELETE /api/inventory/:id — delete by id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    db.prepare('DELETE FROM inventory WHERE id = ?').run(id);
    res.json({ message: 'Item deleted', id: Number(id) });
  } catch (err) {
    console.error('Error deleting inventory item:', err);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

export default router;
