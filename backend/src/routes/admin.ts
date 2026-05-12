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

/**
 * @openapi
 * /api/admin/overview:
 *   get:
 *     summary: System-wide overview stats (admin only)
 *     tags: [Admin]
 *     responses:
 *       200: { description: Overview }
 *       403: { description: Admin access required }
 */
router.get('/overview', (_req: Request, res: Response) => {
  res.json(getAdminOverview());
});

/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     summary: List all users (admin only)
 *     tags: [Admin]
 *     responses:
 *       200: { description: User list }
 *       403: { description: Admin access required }
 */
router.get('/users', (_req: Request, res: Response) => {
  res.json({ users: listAdminUsers() });
});

/**
 * @openapi
 * /api/admin/users/{userId}/reset-password:
 *   post:
 *     summary: Reset a user's password to a generated temporary value (admin only)
 *     description: Generates a one-time temp password, overwrites the target user's hash, and returns the plaintext to the calling admin so they can hand it off out-of-band.
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: New temp password returned }
 *       400: { description: Invalid user id }
 *       403: { description: Admin access required }
 *       404: { description: User not found }
 */
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

// /api/admin/changelog reads CHANGELOG.md from the repo root
const CHANGELOG_PATH = path.resolve(__dirname, '../../../CHANGELOG.md');

/**
 * @openapi
 * /api/admin/changelog:
 *   get:
 *     summary: Get raw CHANGELOG.md markdown (admin only)
 *     tags: [Admin]
 *     responses:
 *       200: { description: Markdown payload }
 *       403: { description: Admin access required }
 */
router.get('/changelog', (_req: Request, res: Response) => {
  try {
    const text = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    res.json({ markdown: text });
  } catch {
    res.json({ markdown: '' });
  }
});

export default router;
