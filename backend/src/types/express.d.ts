// Augment Express Request with authenticated user context.
// Set by requireAuth; on guest-capable routes (optionalAuth), runtime callers
// must guard against the unauthenticated case where this is undefined.
declare namespace Express {
  interface Request {
    userId: number;
  }
}
