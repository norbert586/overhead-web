// Augment Express Request with authenticated user context.
// Set by requireAuth; on guest-capable routes (optionalAuth), runtime callers
// must guard against the unauthenticated case where this is undefined.
declare namespace Express {
  interface Request {
    userId: number;
    /** Set by optionalAuth when a token was presented but rejected. */
    authFailure?: 'auth_expired' | 'auth_invalid';
  }
}
