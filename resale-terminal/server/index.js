import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  const { default: inventoryRoutes } = await import('./routes/inventory.js');
  const { default: seatgeekRoutes } = await import('./routes/seatgeek.js');
  const { default: ticketmasterRoutes } = await import('./routes/ticketmaster.js');
  const { default: anthropicRoutes } = await import('./routes/anthropic.js');
  const { default: settingsRoutes } = await import('./routes/settings.js');
  const { default: supplyRoutes } = await import('./routes/supply.js');
  const { default: multiplatformRoutes } = await import('./routes/multiplatform.js');
  const { default: aggregateRoutes } = await import('./routes/aggregate.js');
  const { default: priceHistoryRoutes } = await import('./routes/pricehistory.js');
  const { default: arizonaRoutes } = await import('./routes/arizona.js');
  const { startAutoScanner } = await import('./lib/autoScanner.js');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const app = express();
  const PORT = process.env.PORT || 3001;

  // Middleware
  if (process.env.NODE_ENV !== 'production') {
    app.use(cors());
  }
  app.use(express.json());
  app.use(morgan('dev'));

  // API Routes
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/seatgeek', seatgeekRoutes);
  app.use('/api/ticketmaster', ticketmasterRoutes);
  app.use('/api/ai', anthropicRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/supply', supplyRoutes);
  app.use('/api/multiplatform', multiplatformRoutes);
  app.use('/api/aggregate', aggregateRoutes);
  app.use('/api/prices', priceHistoryRoutes);
  app.use('/api/arizona', arizonaRoutes);

  // Production: serve static files and SPA fallback
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '..', 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(distPath, 'index.html'));
      }
    });
  }

  app.listen(PORT, () => {
    console.log(`[Resale Terminal] Server running on http://localhost:${PORT}`);
  });

  // Start auto-scanning Arizona events every 6 hours
  startAutoScanner();
} catch (err) {
  console.error('\n[Resale Terminal] STARTUP ERROR — the server failed to start.\n');
  if (err.message && err.message.includes('better-sqlite3')) {
    console.error(
      'It looks like better-sqlite3 is not built for your current Node.js version.\n' +
      'Fix: run   npm rebuild better-sqlite3   then try again.\n'
    );
  } else {
    console.error(err);
  }
  process.exit(1);
}
