import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', '..', 'data', 'resale.db');
mkdirSync(join(__dirname, '..', '..', 'data'), { recursive: true });
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

export default db;
