import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById } from '../database/queries';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Attempt JWT verification but never reject. Used for endpoints that have a
// guest-friendly path (read-only, ephemeral) where the route handler itself
// decides whether the unauthenticated case is allowed.
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
      req.userId = payload.userId;
    } catch {
      // Invalid token — treat as guest rather than 401, since this route allows it.
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

// In-memory token-bucket rate limiter, keyed by IP. Protects the public
// guest endpoint from being used to hammer the upstream ADS-B feed.
// Authenticated requests bypass the limit.
const GUEST_RATE_WINDOW_MS = 60_000;
const GUEST_RATE_MAX = 10;
const guestBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

// Expired buckets are never revisited by their own IP, so sweep them lazily
// once the map grows — keeps memory flat under a churn of one-off guest IPs.
const SWEEP_THRESHOLD = 1_000;

function sweepExpiredBuckets(now: number): void {
  if (guestBuckets.size < SWEEP_THRESHOLD) return;
  for (const [ip, bucket] of guestBuckets) {
    if (bucket.resetAt <= now) guestBuckets.delete(ip);
  }
}

export function guestRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (req.userId !== undefined) {
    next();
    return;
  }
  const ip = clientIp(req);
  const now = Date.now();
  sweepExpiredBuckets(now);
  const bucket = guestBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    guestBuckets.set(ip, { count: 1, resetAt: now + GUEST_RATE_WINDOW_MS });
    next();
    return;
  }
  if (bucket.count >= GUEST_RATE_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({ error: 'Too many requests — sign in for higher limits.' });
    return;
  }
  bucket.count += 1;
  next();
}
