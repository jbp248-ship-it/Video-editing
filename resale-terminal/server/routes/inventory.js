import { Router } from 'express';
import { db } from '../db/jsonDb.js';

const router = Router();

// GET /api/inventory
router.get('/', (req, res) => {
  try {
    res.json(db.all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/summary
router.get('/summary', (req, res) => {
  try {
    res.json(db.summary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory
router.post('/', (req, res) => {
  try {
    const { event_name, purchase_price } = req.body;
    if (!event_name || purchase_price === undefined || purchase_price === null) {
      return res.status(400).json({ error: 'event_name and purchase_price are required' });
    }
    const newRow = db.insert(req.body);
    res.status(201).json(newRow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    const updated = db.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    db.delete(req.params.id);
    res.json({ message: 'Item deleted', id: Number(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
