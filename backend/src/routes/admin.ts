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

// POST /api/admin/users/:id/reset-password
//
// Generates a fresh random password, hashes it, and returns the plaintext
// once so the calling admin can hand it to the user. The plaintext is
// never persisted or logged on the server.
router.post('/users/:id/reset-password', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  const user = findUserById(id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const newPassword = generatePassword();
  const hash = await bcrypt.hash(newPassword, 10);
  setUserPasswordHash(id, hash);
  res.json({ email: user.email, password: newPassword });
});

// 14-char alphabet that drops visually ambiguous glyphs (0/O, 1/l/I).
function generatePassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return out;
}

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
