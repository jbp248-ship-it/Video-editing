CREATE TABLE IF NOT EXISTS inventory (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name      TEXT NOT NULL,
  event_date      TEXT,
  venue           TEXT,
  seat_location   TEXT,
  quantity        INTEGER NOT NULL DEFAULT 1,
  purchase_price  REAL NOT NULL,
  current_value   REAL,
  sold_price      REAL,
  sold_at         TEXT,
  seatgeek_event_id TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
