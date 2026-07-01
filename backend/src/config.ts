// Catch-model tuning knobs.
//
// Under the catch model, sightings are recorded only while a user actively
// has the app open — the browser polls /api/flights with the device's live
// position and whatever is overhead at that moment gets "caught". These
// constants bound how much load a single open session can generate.

/** Default hearing radius — roughly how far away you can hear an aircraft. */
export const CATCH_RADIUS_DEFAULT_NM = 5;

/** Smallest allowed hearing radius. */
export const CATCH_RADIUS_MIN_NM = 1;

/** Largest allowed hearing radius. Recording never happens beyond this. */
export const CATCH_RADIUS_MAX_NM = 15;

/**
 * Minimum spacing between *recording* polls per user. Polls arriving faster
 * than this are served as live view only (no DB writes), so a misbehaving
 * or scripted client can't turn the catch endpoint back into a firehose.
 */
export const CATCH_MIN_RECORD_INTERVAL_MS = 5_000;

/** Clamp an arbitrary radius value into the valid hearing-radius range. */
export function clampCatchRadius(radius: number | null | undefined): number {
  if (typeof radius !== 'number' || !Number.isFinite(radius)) {
    return CATCH_RADIUS_DEFAULT_NM;
  }
  return Math.min(CATCH_RADIUS_MAX_NM, Math.max(CATCH_RADIUS_MIN_NM, radius));
}
