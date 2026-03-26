import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './database/db';
import { runMigrations } from './database/migrations';
import flightsRouter from './routes/flights';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

async function start() {
  await initDb();
  runMigrations();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/flights', flightsRouter);

  // /api/log proxies to the log route on the flights router
  app.get('/api/log', (req, res) => {
    req.url = '/log';
    flightsRouter(req, res, () => {});
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.listen(PORT, () => {
    console.log(`Overhead backend running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
