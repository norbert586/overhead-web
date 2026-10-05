import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById } from '../database/queries';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

/** Why a presented token was rejected — lets the client tell "sign in again" from an outage. */
export type AuthFailure = 'auth_expired' | 'auth_invalid';

function verifyToken(token: string): { userId: number } | AuthFailure {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
    return { userId: payload.userId };
  } catch (err) {
    return err instanceof jwt.TokenExpiredError ? 'auth_expired' : 'auth_invalid';
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', code: 'auth_required' });
    return;
  }
  const result = verifyToken(header.slice(7));
  if (typeof result === 'string') {
    res.status(401).json({
      error: result === 'auth_expired' ? 'Session expired — sign in again' : 'Invalid session — sign in again',
      code: result,
    });
    return;
  }
  req.userId = result.userId;
  next();
}

// Attempt JWT verification but never reject. Used for endpoints that have a
// guest-friendly path (read-only, ephemeral) where the route handler itself
// decides whether the unauthenticated case is allowed.
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const result = verifyToken(header.slice(7));
    if (typeof result === 'string') {
      // Treat as guest rather than 401, since this route allows it — but
      // remember why, so a signed-in-only action can answer "session
      // expired" instead of a generic refusal.
      req.authFailure = result;
    } else {
      req.userId = result.userId;
    }
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = findUserById(req.userId);
  if (!user || !user.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

function clientIp(req: Request): string {
  // Cloudflare sets CF-Connecting-IP to the real client address; the first
  // X-Forwarded-For entry is whatever the client chose to send.
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.length > 0) return cf.trim();
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

// Expired buckets are never revisited by their own IP, so sweep them lazily
// once the map grows — keeps memory flat under a churn of one-off guest IPs.
const SWEEP_THRESHOLD = 1_000;

/**
 * In-memory fixed-window rate limiter, keyed by IP, for public endpoints
 * that cost an upstream call. `guestsOnly` lets signed-in requests through.
 */
export function ipRateLimit(opts: { windowMs: number; max: number; guestsOnly: boolean; message: string }) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    if (opts.guestsOnly && req.userId !== undefined) {
      next();
      return;
    }
    const ip = clientIp(req);
    const now = Date.now();
    if (buckets.size >= SWEEP_THRESHOLD) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }
    const bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }
    if (bucket.count >= opts.max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: opts.message, code: 'rate_limited' });
      return;
    }
    bucket.count += 1;
    next();
  };
}

// Protects the public guest poll from being used to hammer the upstream
// ADS-B feed. The guest client polls every 12 s (5/min); the headroom covers
// carrier-grade NAT, where many phones share one public IP, and the
// immediate re-poll on returning to the tab.
export const guestRateLimit = ipRateLimit({
  windowMs: 60_000,
  max: 20,
  guestsOnly: true,
  message: 'Too many requests — sign in for higher limits.',
});
