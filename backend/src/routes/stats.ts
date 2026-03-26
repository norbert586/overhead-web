import { Router, Request, Response } from 'express';
import { getAllStats } from '../database/queries';

const router = Router();

// GET /api/stats
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json(getAllStats());
  } catch (err) {
    console.error('GET /api/stats error:', err);
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

export default router;
