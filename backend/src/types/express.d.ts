// Augment Express Request with authenticated user context
declare namespace Express {
  interface Request {
    userId: number;
  }
}
