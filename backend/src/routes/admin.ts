import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { listAdminUsers, getAdminOverview } from '../database/queries';

const router = Router();

router.use(requireAuth, requireAdmin);

// GET /api/admin/overview
router.get('/overview', (_req: Request, res: Response) => {
  res.json(getAdminOverview());
});

// GET /api/admin/users
router.get('/users', (_req: Request, res: Response) => {
  res.json({ users: listAdminUsers() });
});

// GET /api/admin/changelog — raw markdown of CHANGELOG.md from the repo root
const CHANGELOG_PATH = path.resolve(__dirname, '../../../CHANGELOG.md');

router.get('/changelog', (_req: Request, res: Response) => {
  try {
    const text = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    res.json({ markdown: text });
  } catch {
    res.json({ markdown: '' });
  }
});

export default router;
