/**
 * World (metres) <-> screen (pixels) mapping for the simulation canvas.
 *
 * The scale is deliberately ISOTROPIC — the same pixels-per-metre on both
 * axes — so a 45 degree launch actually looks like 45 degrees and a shallow
 * arc looks shallow. Anisotropic fitting would make every trajectory a lie.
 *
 * The camera is fixed for the whole run: bounds are computed from a full
 * pre-pass of the (deterministic) simulation before the animation starts, so
 * nothing rescales mid-flight.
 */

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Viewport {
  /** Pixels per metre, identical on both axes. */
  scale: number;
  /** Screen x of world x = 0. */
  originX: number;
  /** Screen y of world y = 0 (ground level). */
  groundY: number;
  width: number;
  height: number;
  /** Top of the world in screen pixels, for the ruler. */
  topY: number;
  bounds: WorldBounds;
}

const RULER_GUTTER = 40; // left strip reserved for the height scale
const RIGHT_PAD = 18;
const TOP_PAD = 26;
/** Fraction of the canvas given over to the ground band at the bottom. */
const GROUND_BAND = 0.13;

export function makeViewport(
  width: number,
  height: number,
  bounds: WorldBounds,
  hasGround: boolean
): Viewport {
  const groundY = hasGround ? height * (1 - GROUND_BAND) : height - 18;
  const availH = groundY - TOP_PAD;
  const availW = width - RULER_GUTTER - RIGHT_PAD;

  const worldH = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const worldW = Math.max(bounds.maxX - bounds.minX, 0);

  // A zero-width world (a pure vertical drop) must not divide by zero; in that
  // case the vertical fit alone decides the scale.
  const scaleH = availH / worldH;
  const scaleW = worldW > 1e-6 ? availW / worldW : Infinity;
  const scale = Math.min(scaleH, scaleW);

  const usedW = worldW * scale;
  const left = RULER_GUTTER + (availW - usedW) / 2;
  const originX = left - bounds.minX * scale;

  return {
    scale,
    originX,
    groundY: groundY - bounds.minY * scale,
    width,
    height,
    topY: groundY - (bounds.maxY - bounds.minY) * scale,
    bounds,
  };
}

export function toScreenX(vp: Viewport, worldX: number): number {
  return vp.originX + worldX * vp.scale;
}

export function toScreenY(vp: Viewport, worldY: number): number {
  return vp.groundY - worldY * vp.scale;
}

/**
 * Pick a "round" tick interval (1, 2, 5 x 10^n) giving roughly `target` ticks
 * across the range, so the ruler never reads 13.7 m.
 */
export function niceStep(range: number, target = 6): number {
  if (range <= 0) return 1;
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export function rulerTicks(vp: Viewport): { value: number; y: number; major: boolean }[] {
  const top = vp.bounds.maxY;
  const step = niceStep(top - vp.bounds.minY, 5);
  const ticks: { value: number; y: number; major: boolean }[] = [];
  const minor = step / 2;
  for (let v = vp.bounds.minY, i = 0; v <= top + 1e-9 && i < 400; v += minor, i++) {
    const isMajor = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    ticks.push({ value: v, y: toScreenY(vp, v), major: isMajor });
  }
  return ticks;
}

/**
 * On-screen radius of the object.
 *
 * Physical size is used where it reads well, but clamped: at 100 m of world
 * height a real 1.6 cm marble would be a third of a pixel, and at 0.5 m a
 * football would fill the canvas. Only the drawing is clamped — the area used
 * in the drag calculation is always the true one.
 */
export function renderRadius(vp: Viewport, sizeMeters: number): number {
  const trueRadius = (sizeMeters / 2) * vp.scale;
  return Math.min(46, Math.max(7, trueRadius));
}
