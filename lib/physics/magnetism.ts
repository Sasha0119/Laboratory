/**
 * Two bar magnets sharing a horizontal axis.
 *
 * Steady-state, like `circuit.ts` — every value below is exact for the
 * current inputs, so the UI can stay purely reactive with no Run button.
 *
 * ---------------------------------------------------------------- force --
 *
 * The force readout uses the simplified magnetic-pole model: literally
 * Coulomb's law with pole strength standing in for charge,
 *
 *     F = k * p1 * p2 / r²
 *
 * treating each magnet as a single point of pole strength `r` apart. This is
 * a standard, legitimate teaching simplification — the real field of a bar
 * magnet needs the calculus-based dipole equations, which is out of scope
 * here. `FORCE_CONSTANT` (k) is chosen to be exactly 1: with pole strengths
 * in 1..100 and distance in 1..50 (arbitrary units, labelled cm in the UI),
 * that already produces a wide but readable range of numbers with no extra
 * scaling to explain.
 *
 * ------------------------------------------------------------ field model --
 *
 * The field lines and iron-filing alignment are a separate, richer
 * calculation used only for the visuals, never for the force number: each
 * bar magnet is modelled as two point poles (+p at one end, -p at the
 * other) a fixed length apart, and the field at any point is the vector sum
 * of all four poles' contributions. That is still nothing but the same
 * inverse-square pole law from above, applied four times and added up
 * (poles superpose linearly, which is physically legitimate) — it is what
 * lets the field lines actually curve correctly as the inputs change,
 * without reaching for the closed-form dipole field equation either.
 */

export type Orientation = 'attract' | 'repel';

export const FORCE_CONSTANT = 1;

/** Below this separation the force formula is not evaluated (would blow up). */
const MIN_DISTANCE = 0.05;

export interface MagnetsInput {
  /** Centre-to-centre separation, cm. */
  distance: number;
  strengthA: number;
  strengthB: number;
  orientation: Orientation;
}

export interface ForceResult {
  /** Always >= 0. */
  magnitude: number;
  attracting: boolean;
}

export function computeForce(input: MagnetsInput): ForceResult {
  const r = Math.max(input.distance, MIN_DISTANCE);
  const magnitude = (FORCE_CONSTANT * input.strengthA * input.strengthB) / (r * r);
  return { magnitude, attracting: input.orientation === 'attract' };
}

/**
 * Roughly what two strong (80/100) magnets 5 cm apart produce. Used only to
 * normalise the force meter/arrow/glow to a 0..1 fraction — chosen so a
 * dramatic-but-reachable setup reads as "full", not only the extreme corner
 * of the sliders.
 */
export const REFERENCE_FORCE = 250;

/** 0..1, log-scaled — force spans several orders of magnitude across the sliders. */
export function forceFraction(magnitude: number): number {
  const f = Math.log10(1 + Math.max(magnitude, 0)) / Math.log10(1 + REFERENCE_FORCE);
  return Math.min(1, Math.max(0, f));
}

/** Distance at or below which two attracting magnets visually snap together. */
export const SNAP_DISTANCE = 4;

// ------------------------------------------------------------ field model --

/** Half the drawn length of a bar magnet, in the same units as `distance`. */
export const MAGNET_HALF_LENGTH = 1.5;

export interface Pole {
  x: number;
  y: number;
  /** Signed: positive is a north pole, negative is south. */
  strength: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * The two poles of one bar magnet centred at `centerX` on the y = 0 axis.
 * `northAtPositiveX` says which end carries the north pole; strength must
 * already be signed the way the caller wants (this is what lets a smooth
 * attract/repel transition be expressed as strength easing through zero
 * rather than the poles jumping to new positions — see `useMagnetSim`).
 */
export function magnetPoles(centerX: number, strength: number, northAtPositiveX: boolean): [Pole, Pole] {
  const sign = northAtPositiveX ? 1 : -1;
  return [
    { x: centerX + sign * MAGNET_HALF_LENGTH, y: 0, strength },
    { x: centerX - sign * MAGNET_HALF_LENGTH, y: 0, strength: -strength },
  ];
}

const MIN_R2 = 0.01;

/** The combined field vector at a point, from every pole given. Direction only matters up to scale for rendering, but the magnitude is meaningful too (used to fade distant filings). */
export function fieldVectorAt(x: number, y: number, poles: Pole[]): Vec2 {
  let fx = 0;
  let fy = 0;
  for (const p of poles) {
    const dx = x - p.x;
    const dy = y - p.y;
    const r2 = Math.max(dx * dx + dy * dy, MIN_R2);
    const r = Math.sqrt(r2);
    const mag = p.strength / r2;
    fx += (dx / r) * mag;
    fy += (dy / r) * mag;
  }
  return { x: fx, y: fy };
}

export interface FieldLine {
  points: Vec2[];
  /** Which pole this line was seeded from — purely informational for the caller. */
  fromNorthStrength: number;
}

export interface TraceOptions {
  /** How many lines to seed around the pole (before halving to a hemisphere). */
  count: number;
  /** Maximum steps to walk before giving up. */
  maxSteps: number;
  stepLength: number;
  /** Stop a line once it gets this close to any (non-source) pole. */
  captureRadius: number;
  /** Field lines wandering outside this box are cut short. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/**
 * Streamlines traced outward from every north pole, by simple Euler
 * integration along the local field direction — the standard way to draw
 * field lines for a vector field with no closed-form solution. Each line
 * stops when it wanders close enough to another pole (it has "arrived"),
 * leaves the drawing area, or runs out of steps.
 */
export function traceFieldLines(poles: Pole[], options: TraceOptions): FieldLine[] {
  const lines: FieldLine[] = [];
  const northPoles = poles.filter((p) => p.strength > 0);

  for (const source of northPoles) {
    for (let i = 0; i < options.count; i++) {
      // Seed points on a small ring around the pole, biased away from the
      // magnet's own body by skipping the two angles that point straight
      // along the axis toward its own south pole.
      const angle = (i / options.count) * Math.PI * 2 + Math.PI / options.count;
      let x = source.x + Math.cos(angle) * options.captureRadius * 1.5;
      let y = source.y + Math.sin(angle) * options.captureRadius * 1.5;
      const points: Vec2[] = [{ x, y }];

      for (let step = 0; step < options.maxSteps; step++) {
        const field = fieldVectorAt(x, y, poles);
        const mag = Math.hypot(field.x, field.y);
        if (mag < 1e-6) break;
        const nextX = x + (field.x / mag) * options.stepLength;
        const nextY = y + (field.y / mag) * options.stepLength;

        // Stop before recording a point outside the box, so every point in
        // the returned line is one the caller can actually draw.
        if (
          nextX < options.bounds.minX ||
          nextX > options.bounds.maxX ||
          nextY < options.bounds.minY ||
          nextY > options.bounds.maxY
        ) {
          break;
        }

        x = nextX;
        y = nextY;
        points.push({ x, y });

        const captured = poles.some(
          (p) => p !== source && Math.hypot(x - p.x, y - p.y) < options.captureRadius
        );
        if (captured) break;
      }

      if (points.length > 1) lines.push({ points, fromNorthStrength: source.strength });
    }
  }

  return lines;
}
