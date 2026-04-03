import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import inventoryRoutes from './routes/inventory.js';
import seatgeekRoutes from './routes/seatgeek.js';
import ticketmasterRoutes from './routes/ticketmaster.js';
import anthropicRoutes from './routes/anthropic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// API Routes
app.use('/api/inventory', inventoryRoutes);
app.use('/api/seatgeek', seatgeekRoutes);
app.use('/api/ticketmaster', ticketmasterRoutes);
app.use('/api/ai', anthropicRoutes);

// Production: serve static files and SPA fallback
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'dist');
  app.use(express.static(distPath));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return;
    res.sendFile(join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Resale Terminal server running on http://localhost:${PORT}`);
});
