import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  createUser,
  findUserByEmail,
  findUserById,
  setUserPasswordHash,
  createPasswordResetToken,
  findActivePasswordResetToken,
  markPasswordResetTokenUsed,
  invalidateUserPasswordResetTokens,
  createEmailVerificationToken,
  findActiveEmailVerificationToken,
  markEmailVerificationTokenUsed,
  markEmailVerified,
} from '../database/queries';
import { requireAuth } from '../middleware/auth';
import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../services/email';
import { logger } from '../logger';

const router = Router();
const log = logger.child({ module: 'auth' });

const JWT_SECRET  = process.env.JWT_SECRET  ?? 'dev-secret-change-in-production';
const INVITE_CODE = process.env.INVITE_CODE ?? 'overhead2024';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;            // 1 hour
const VERIFICATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function expiresAt(ttlMs: number): string {
  return new Date(Date.now() + ttlMs).toISOString();
}

function issueAuthToken(userId: number, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '30d' });
}

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
  const token = issueAuthToken(user.id, user.email);

  // Issue a verification token and email it. Soft verification: account is
  // active immediately, but the banner stays up until the link is clicked.
  const verifyToken = generateToken();
  createEmailVerificationToken(
    user.id,
    hashToken(verifyToken),
    expiresAt(VERIFICATION_TOKEN_TTL_MS),
  );

  // Fire-and-forget — never block the response on email delivery.
  sendWelcomeEmail(email).catch(() => {});
  sendVerificationEmail(email, verifyToken).catch(() => {});

  res.status(201).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      isAdmin: !!user.is_admin,
      emailVerified: false,
    },
  });
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

  const token = issueAuthToken(user.id, user.email);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      isAdmin: !!user.is_admin,
      emailVerified: !!user.email_verified_at,
    },
  });
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
 *                 emailVerified: { type: boolean }
 *       401: { description: Unauthorized }
 *       404: { description: User not found }
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = findUserById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    isAdmin: !!user.is_admin,
    emailVerified: !!user.email_verified_at,
  });
});

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     description: Always returns 200 to avoid leaking which emails are registered. If the email is on file, a reset link is mailed; otherwise nothing happens.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Request accepted }
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };

  // Always 200 — never reveal whether the email is registered.
  if (!email) {
    res.json({ ok: true });
    return;
  }

  const user = findUserByEmail(email);
  if (user) {
    const token = generateToken();
    createPasswordResetToken(
      user.id,
      hashToken(token),
      expiresAt(RESET_TOKEN_TTL_MS),
    );
    sendPasswordResetEmail(email, token).catch((err) => {
      log.error({ err, userId: user.id }, 'forgot-password: send failed');
    });
  } else {
    log.info({ email }, 'forgot-password: no such user');
  }

  res.json({ ok: true });
});

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset a password using a token from the reset email
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:    { type: string }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: Password updated; returns a fresh auth token }
 *       400: { description: Missing fields }
 *       410: { description: Token expired, used, or invalid }
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) {
    res.status(400).json({ error: 'token and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' });
    return;
  }

  const row = findActivePasswordResetToken(hashToken(token));
  if (!row) {
    res.status(410).json({ error: 'This reset link is invalid or has expired' });
    return;
  }

  const user = findUserById(row.user_id);
  if (!user) {
    res.status(410).json({ error: 'This reset link is invalid or has expired' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  setUserPasswordHash(user.id, passwordHash);
  markPasswordResetTokenUsed(row.id);
  invalidateUserPasswordResetTokens(user.id);

  // Log them straight in — they just proved control of the email and
  // typed a new password; making them go to the login screen next is
  // unnecessary friction.
  const authToken = issueAuthToken(user.id, user.email);
  res.json({
    token: authToken,
    user: {
      id: user.id,
      email: user.email,
      isAdmin: !!user.is_admin,
      emailVerified: !!user.email_verified_at,
    },
  });
});

/**
 * @openapi
 * /api/auth/verify-email:
 *   post:
 *     summary: Confirm an email address using a token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200: { description: Email verified }
 *       410: { description: Token expired, used, or invalid }
 */
router.post('/verify-email', (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token) {
    res.status(400).json({ error: 'token is required' });
    return;
  }

  const row = findActiveEmailVerificationToken(hashToken(token));
  if (!row) {
    res.status(410).json({ error: 'This verification link is invalid or has expired' });
    return;
  }

  markEmailVerificationTokenUsed(row.id);
  markEmailVerified(row.user_id);
  res.json({ ok: true });
});

/**
 * @openapi
 * /api/auth/resend-verification:
 *   post:
 *     summary: Re-send the email verification link to the current user
 *     tags: [Auth]
 *     responses:
 *       200: { description: Verification email re-sent (or no-op if already verified) }
 *       401: { description: Unauthorized }
 */
router.post('/resend-verification', requireAuth, (req: Request, res: Response) => {
  const user = findUserById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (user.email_verified_at) {
    res.json({ ok: true, alreadyVerified: true });
    return;
  }

  const token = generateToken();
  createEmailVerificationToken(
    user.id,
    hashToken(token),
    expiresAt(VERIFICATION_TOKEN_TTL_MS),
  );
  sendVerificationEmail(user.email, token).catch((err) => {
    log.error({ err, userId: user.id }, 'resend-verification: send failed');
  });

  res.json({ ok: true });
});

export default router;
