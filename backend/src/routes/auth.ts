import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, findUserByEmail, findUserById } from '../database/queries';
import { requireAuth } from '../middleware/auth';

const router = Router();

const JWT_SECRET  = process.env.JWT_SECRET  ?? 'dev-secret-change-in-production';
const INVITE_CODE = process.env.INVITE_CODE ?? 'overhead2024';

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, inviteCode } = req.body as {
    email?: string; password?: string; inviteCode?: string;
  };

  if (!email || !password || !inviteCode) {
    res.status(400).json({ error: 'email, password, and inviteCode are required' });
    return;
  }

  if (inviteCode !== INVITE_CODE) {
    res.status(403).json({ error: 'Invalid invite code' });
    return;
  }

  if (findUserByEmail(email)) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = createUser(email, passwordHash, inviteCode);

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: { id: user.id, email: user.email } });
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const user = findUserByEmail(email);
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash as string);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email } });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = findUserById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ id: user.id, email: user.email });
});

export default router;
