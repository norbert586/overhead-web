import { Router, Request, Response } from 'express';
import { optionalAuth, ipRateLimit } from '../middleware/auth';
import { resolvePhotos, reportBrokenPhoto, airlineFromCallsign } from '../services/photos';
import { logger } from '../logger';

const log = logger.child({ module: 'photos-route' });

const router = Router();

// Guests see photos too (Planespotters' terms want photo areas freely
// available). The client asks once per aircraft, so this only bites a scraper.
const photoLimit = ipRateLimit({
  windowMs: 60_000,
  max: 60,
  guestsOnly: true,
  message: 'Too many photo lookups — try again shortly.',
});
// Each report makes the server fetch an image, so it's capped for everyone.
const reportLimit = ipRateLimit({
  windowMs: 10 * 60_000,
  max: 20,
  guestsOnly: false,
  message: 'Too many reports.',
});

function param(raw: unknown, pattern: RegExp): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toUpperCase();
  return pattern.test(v) ? v : null;
}

/**
 * @openapi
 * /api/photos:
 *   get:
 *     summary: Every photo worth trying for an aircraft, best first
 *     description: |
 *       Exact-airframe photos (Planespotters, Airport-Data), else a same-model
 *       stand-in (same airline first), plus a Wikimedia Commons reference
 *       photo of the type as the last resort. Each candidate carries its
 *       credit, link-back page and, when known, the aircraft's bounding box
 *       (`focus`, fractions of the image) for framing. `complete: false`
 *       means an airframe provider could not be asked, so a missing exact
 *       photo may not be final. Public; guests are rate-limited per IP.
 *     tags: [Photos]
 *     parameters:
 *       - { in: query, name: hex, schema: { type: string }, description: ICAO 24-bit address }
 *       - { in: query, name: reg, schema: { type: string } }
 *       - { in: query, name: type, schema: { type: string }, description: ICAO type designator }
 *       - { in: query, name: callsign, schema: { type: string }, description: Picks same-airline stand-ins }
 *     responses:
 *       200: { description: "{ candidates, complete }" }
 *       400: { description: "None of hex / reg / type given (code: bad_request)" }
 *       429: { description: "Rate limited (code: rate_limited)" }
 */
router.get('/', optionalAuth, photoLimit, async (req: Request, res: Response) => {
  const hex = param(req.query.hex, /^[0-9A-F]{6}$/)?.toLowerCase() ?? null;
  const registration = param(req.query.reg, /^[A-Z0-9][A-Z0-9-]{1,9}$/);
  const aircraftType = param(req.query.type, /^[A-Z0-9]{2,4}$/);
  const callsign = param(req.query.callsign, /^[A-Z0-9]{2,8}$/);
  if (!hex && !registration && !aircraftType) {
    res.status(400).json({ error: 'hex, reg or type is required', code: 'bad_request' });
    return;
  }
  try {
    res.json(await resolvePhotos({ hex, registration, aircraftType, airline: airlineFromCallsign(callsign) }));
  } catch (err) {
    log.error({ err, hex, registration, aircraftType }, 'photo lookup failed');
    res.status(500).json({ error: 'Photo lookup failed', code: 'server_error' });
  }
});

/**
 * @openapi
 * /api/photos/broken:
 *   post:
 *     summary: Report a photo URL that failed to load
 *     description: |
 *       The server re-checks the URL itself and, if the provider really has
 *       dropped it, purges it from every cache so the next lookup finds a
 *       replacement. Answers immediately; the check runs in the background.
 *     tags: [Photos]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { url: { type: string } } }
 *     responses:
 *       202: { description: Queued for a re-check }
 *       400: { description: "Missing url (code: bad_request)" }
 */
router.post('/broken', reportLimit, (req: Request, res: Response) => {
  const url = (req.body as { url?: unknown } | undefined)?.url;
  if (typeof url !== 'string' || !url || url.length > 600) {
    res.status(400).json({ error: 'url is required', code: 'bad_request' });
    return;
  }
  void reportBrokenPhoto(url).catch((err) => log.warn({ err, url }, 'broken-photo check failed'));
  res.status(202).json({ queued: true });
});

export default router;
