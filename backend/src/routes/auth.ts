import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, findUserByEmail, findUserById } from '../database/queries';
import { requireAuth } from '../middleware/auth';
import { sendWelcomeEmail } from '../services/email';

const router = Router();

const JWT_SECRET  = process.env.JWT_SECRET  ?? 'dev-secret-change-in-production';
const INVITE_CODE = process.env.INVITE_CODE ?? 'overhead2024';

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user with an invite code
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, inviteCode]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *               inviteCode: { type: string }
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       400: { description: Missing fields, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       403: { description: Invalid invite code, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       409: { description: Email already registered, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
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

  // Fire-and-forget — never blocks the response
  sendWelcomeEmail(email).catch(() => {});

  res.status(201).json({ token, user: { id: user.id, email: user.email, isAdmin: !!user.is_admin } });
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Log in with email and password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       400: { description: Missing fields }
 *       401: { description: Invalid credentials }
 */
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
  res.json({ token, user: { id: user.id, email: user.email, isAdmin: !!user.is_admin } });
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get the currently authenticated user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 email: { type: string, format: email }
 *                 isAdmin: { type: boolean }
 *       401: { description: Unauthorized }
 *       404: { description: User not found }
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = findUserById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ id: user.id, email: user.email, isAdmin: !!user.is_admin });
});

export default router;
