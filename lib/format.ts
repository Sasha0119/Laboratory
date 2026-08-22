/**
 * Display formatting.
 *
 * The rule this file exists to enforce: **rounding happens here and nowhere
 * else**. The simulation always carries full double precision — every value
 * passed in is the real one, and only the string coming out is rounded. No
 * caller should ever round a number and then feed it back into the physics.
 *
 * The other job here is translating physics into plain language, so someone
 * with no background can read the screen. Raw symbols (v, vy, t, Cd) are only
 * ever shown in detailed mode.
 */

/**
 * Round a quantity to a sensible number of digits for reading at a glance.
 *
 *   14.23847 -> "14"      (big numbers do not need decimals)
 *    1.48900 -> "1.5"     (small ones would lose too much)
 *    0.00080 -> "0.0008"  (tiny ones keep enough to be non-zero)
 */
export function friendly(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  if (a >= 0.01) return v.toFixed(2);
  if (a >= 0.001) return v.toFixed(4);
  return v.toExponential(1);
}

/** Time always keeps one decimal — "1.5 s" reads better than "2 s". */
export function friendlyTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const a = Math.abs(seconds);
  if (a >= 100) return seconds.toFixed(0);
  if (a >= 1) return seconds.toFixed(1);
  return seconds.toFixed(2);
}

/** Full precision, for detailed mode where the exact figure is the point. */
export function precise(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '—';
  return v.toFixed(digits);
}

/**
 * Translation key for an everyday thing that moves at roughly this speed.
 *
 * Returns a key rather than a sentence so this stays free of English; the
 * caller resolves it with `t(...)`. Returns null when a comparison would add
 * nothing (barely moving, or so fast that nothing everyday compares).
 *
 * The bands are deliberately loose — they are intuition pumps, not
 * measurements. Road speeds are the most recognisable anchor, so the middle of
 * the range leans on them: 8 m/s is 30 km/h, 14 m/s is 50 km/h, 33 m/s is
 * 120 km/h.
 */
export function speedComparisonKey(metersPerSecond: number): string | null {
  const v = Math.abs(metersPerSecond);
  if (v < 0.4) return null;
  if (v < 1.5) return 'comparisons.slowerThanWalking';
  if (v < 2.5) return 'comparisons.walkingPace';
  if (v < 4.5) return 'comparisons.joggingPace';
  if (v < 8) return 'comparisons.cyclingPace';
  if (v < 14) return 'comparisons.quietStreet';
  if (v < 22) return 'comparisons.carInTown';
  if (v < 33) return 'comparisons.openRoad';
  if (v < 50) return 'comparisons.motorway';
  if (v < 75) return 'comparisons.skydiver';
  return 'comparisons.fasterThanSkydiver';
}

/** Which of `directions.*` describes this horizontal velocity. */
export function directionKey(velocity: number): 'left' | 'right' | 'stopped' {
  if (Math.abs(velocity) < 0.005) return 'stopped';
  return velocity > 0 ? 'right' : 'left';
}

/** "→" / "←" / "•" to sit next to a speed. Direction glyphs need no translation. */
export function directionArrow(velocity: number): string {
  if (Math.abs(velocity) < 0.005) return '•';
  return velocity > 0 ? '→' : '←';
}

/**
 * Convert m/s to km/h for a secondary caption. Kept separate from the
 * comparison text so a caller can show either, or both.
 */
export function kmh(metersPerSecond: number): number {
  return metersPerSecond * 3.6;
}
