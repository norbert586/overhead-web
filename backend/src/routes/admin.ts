import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { requireAuth, requireAdmin } from '../middleware/auth';
import {
  listAdminUsers,
  getAdminOverview,
  findUserById,
  setUserPasswordHash,
} from '../database/queries';

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

// POST /api/admin/users/:userId/reset-password
// Generates a one-time temp password, overwrites the target user's hash, and
// returns the plaintext to the calling admin so they can hand it off out-of-band.
router.post('/users/:userId/reset-password', async (req: Request, res: Response) => {
  const userId = Number.parseInt(req.params.userId, 10);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const target = findUserById(userId);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const tempPassword = crypto.randomBytes(9).toString('base64url');
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  setUserPasswordHash(userId, passwordHash);

  res.json({ userId: target.id, email: target.email, tempPassword });
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
