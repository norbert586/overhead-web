import { Router, Request, Response } from 'express';
import { getAllStats } from '../database/queries';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// GET /api/stats
router.get('/', (req: Request, res: Response) => {
  try {
    res.json(getAllStats(req.userId));
  } catch (err) {
    console.error('GET /api/stats error:', err);
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

export default router;
