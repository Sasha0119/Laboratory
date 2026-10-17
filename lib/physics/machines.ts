/**
 * Simple machines: the lever, the inclined plane and the pulley.
 *
 * All three are the same trade. A machine does not make energy; it lets you
 * push with less force over a longer distance, so that
 *
 *     effort × effort distance  =  load × load distance        (work in = work out)
 *
 * and the ratio of the two forces is the mechanical advantage:
 *
 *     MA = load force / effort force
 *
 * These are the frictionless, massless ideals. There is no friction on the
 * ramp, no friction in the pulleys or at the pivot, and the plank, the rope and
 * the pulleys weigh nothing. That is the whole scope of this module; adding any
 * of those would change every formula below.
 *
 * Pure functions, SI units (kg, m, N, J), and no display text.
 */

import { ENVIRONMENTS } from './constants';

/** Gravitational acceleration used to turn a mass into a weight, m/s². */
export const GRAVITY = ENVIRONMENTS.earth.gravity;

export type MachineId = 'lever' | 'incline' | 'pulley';
export const MACHINE_ORDER: MachineId[] = ['lever', 'incline', 'pulley'];

/** Input bounds, kept here so the UI and the physics agree on what is legal. */
export const MACHINE_LIMITS = {
  /** The mass of the load or box, kg. */
  loadMin: 1,
  loadMax: 50,

  /** The lever is a fixed-length plank; the pivot slides along it. */
  leverLength: 4,
  pivotMin: 0.4,
  pivotMax: 3.6,

  rampLengthMin: 1,
  rampLengthMax: 10,
  rampHeightMin: 0.2,
  rampHeightMax: 3,
  /** The steepest ramp allowed, as height / length (about 64°). */
  rampMaxSlope: 0.9,

  pulleysMin: 1,
  pulleysMax: 6,

  effortMin: 0,
  effortMaxLever: 5000,
  effortMaxIncline: 1000,
  effortMaxPulley: 1000,
} as const;

/** How far the load rises in the pulley mode when the rope is pulled all the way, m. */
export const PULLEY_TRAVEL = 1.5;

/** Weight of a mass, N. */
export function weightOf(mass: number): number {
  return mass * GRAVITY;
}

/** Work done by a constant force over a distance along it, J. */
export function work(force: number, distance: number): number {
  return force * distance;
}

/**
 * Whether a push of `effort` newtons can move a load that needs `required`.
 *
 * Exactly enough counts: at the required force the net force is zero, which is
 * what lifting at a steady, slow pace takes.
 */
export function isEnough(effort: number, required: number): boolean {
  return effort >= required - 1e-9;
}

/** The smallest effort worth typing in: the requirement rounded up to a tenth. */
export function roundUpEffort(required: number): number {
  return Math.ceil(required * 10 - 1e-9) / 10;
}

/** Effort over what is needed; 1 is exactly enough. */
export function effortRatio(effort: number, required: number): number {
  return required > 0 ? effort / required : Number.POSITIVE_INFINITY;
}

// ------------------------------------------------------------------- lever --

/**
 * The plank rests with its load end on the ground, tilted by this much, so the
 * pivot is raised to match. Moving the pivot moves where the plank touches down.
 */
export const LEVER_REST_ANGLE = (12 * Math.PI) / 180;
/** The most the plank is allowed to swing, rad. */
export const LEVER_MAX_ANGLE = (30 * Math.PI) / 180;

export interface LeverInput {
  /** kg */
  loadMass: number;
  /** Distance from the load to the pivot, m. */
  loadArm: number;
  /** N */
  effort: number;
  /** Total length of the plank, m. */
  length?: number;
}

export interface LeverResult {
  /** The weight of the load, N. */
  loadForce: number;
  loadArm: number;
  effortArm: number;
  /** Torque the load puts on the pivot, N·m. */
  loadTorque: number;
  /** Torque the user's push puts on the pivot, N·m. */
  effortTorque: number;
  /** Effort arm / load arm. */
  mechanicalAdvantage: number;
  /** The least push that balances the load, N. */
  effortRequired: number;
  enough: boolean;
}

/** The law of the lever: effort × effort arm = load × load arm. */
export function leverAnalysis(input: LeverInput): LeverResult {
  const length = input.length ?? MACHINE_LIMITS.leverLength;
  const loadArm = input.loadArm;
  const effortArm = length - loadArm;
  const loadForce = weightOf(input.loadMass);
  const effortRequired = (loadForce * loadArm) / effortArm;
  return {
    loadForce,
    loadArm,
    effortArm,
    loadTorque: loadForce * loadArm,
    effortTorque: input.effort * effortArm,
    mechanicalAdvantage: effortArm / loadArm,
    effortRequired,
    enough: isEnough(input.effort, effortRequired),
  };
}

export interface LeverGeometry {
  loadArm: number;
  effortArm: number;
  /** Height of the pivot above the ground, m. */
  pivotHeight: number;
  /** Angle at which the load end rests on the ground, rad (the load end is low). */
  restAngle: number;
  /** Angle at which the plank stops with the load raised, rad. */
  maxAngle: number;
  /** How far the load end rises over the whole swing, m. */
  loadRise: number;
  /** How far the effort end falls over the whole swing, m. */
  effortDrop: number;
}

/**
 * Where the plank can go.
 *
 * The angle is measured from level, positive when the load end is up. It starts
 * at `-restAngle` (load on the ground) and swings until the effort end meets the
 * ground or the plank reaches `LEVER_MAX_ANGLE`. Heights are vertical, so the
 * effort end always moves `effortArm / loadArm` times as far as the load end.
 */
export function leverGeometry(loadArm: number, effortArm: number): LeverGeometry {
  const rest = LEVER_REST_ANGLE;
  const pivotHeight = loadArm * Math.sin(rest);
  const toGround = Math.asin(Math.min(1, pivotHeight / effortArm));
  const maxAngle = Math.min(LEVER_MAX_ANGLE, toGround);
  const swing = Math.sin(maxAngle) + Math.sin(rest);
  return {
    loadArm,
    effortArm,
    pivotHeight,
    restAngle: rest,
    maxAngle,
    loadRise: loadArm * swing,
    effortDrop: effortArm * swing,
  };
}

/** The plank's angle for a progress from 0 (load on the ground) to 1 (fully raised), rad. */
export function leverAngle(geometry: LeverGeometry, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  // Linear in the load's height, so the load rises evenly with progress.
  const s = -Math.sin(geometry.restAngle) + p * (Math.sin(geometry.maxAngle) + Math.sin(geometry.restAngle));
  return Math.asin(Math.min(1, Math.max(-1, s)));
}

export interface WorkResult {
  /** Work the effort does at the least force that works, J. */
  input: number;
  /** Work the load receives, J. */
  output: number;
  /** How far the effort moves, m. */
  effortDistance: number;
  /** How far the load moves, m. */
  loadDistance: number;
}

/** Work in and out for one full swing of the lever, using the least effort that works. */
export function leverWork(input: LeverInput): WorkResult {
  const r = leverAnalysis(input);
  const g = leverGeometry(r.loadArm, r.effortArm);
  return {
    input: work(r.effortRequired, g.effortDrop),
    output: work(r.loadForce, g.loadRise),
    effortDistance: g.effortDrop,
    loadDistance: g.loadRise,
  };
}

// ----------------------------------------------------------- inclined plane --

export interface InclineInput {
  /** kg */
  loadMass: number;
  /** Length of the slope, m. */
  length: number;
  /** Vertical rise of the slope, m. */
  height: number;
  /** N, along the slope */
  effort: number;
}

export interface InclineResult {
  /** The weight of the box, N. This is also the force to lift it straight up. */
  loadForce: number;
  /** Angle of the slope, rad. */
  angle: number;
  /** The push along the frictionless slope that holds the box, N. */
  effortRequired: number;
  /** Ramp length / height. */
  mechanicalAdvantage: number;
  /** Force to lift the box straight up, N (its full weight). */
  liftForce: number;
  enough: boolean;
  /** Whether the same effort would lift the box straight up. */
  canLiftStraight: boolean;
}

/** The tallest ramp allowed at a given length. */
export function maxRampHeight(length: number): number {
  return Math.min(MACHINE_LIMITS.rampHeightMax, length * MACHINE_LIMITS.rampMaxSlope);
}

/** Effort along a frictionless ramp: (weight × height) / length. */
export function inclineAnalysis(input: InclineInput): InclineResult {
  const loadForce = weightOf(input.loadMass);
  const effortRequired = (loadForce * input.height) / input.length;
  return {
    loadForce,
    angle: Math.asin(input.height / input.length),
    effortRequired,
    mechanicalAdvantage: input.length / input.height,
    liftForce: loadForce,
    enough: isEnough(input.effort, effortRequired),
    canLiftStraight: isEnough(input.effort, loadForce),
  };
}

/** Work in and out for pushing the box all the way up, using the least effort that works. */
export function inclineWork(input: InclineInput): WorkResult {
  const r = inclineAnalysis(input);
  return {
    input: work(r.effortRequired, input.length),
    output: work(r.loadForce, input.height),
    effortDistance: input.length,
    loadDistance: input.height,
  };
}

// ------------------------------------------------------------------ pulley --

export interface PulleyInput {
  /** kg */
  loadMass: number;
  /** Pulleys in the system, counting both the fixed and the moving ones. */
  pulleys: number;
  /** N */
  effort: number;
}

export interface PulleyResult {
  loadForce: number;
  /** Rope segments that hold the load up. */
  segments: number;
  /** Equal to the number of supporting segments. */
  mechanicalAdvantage: number;
  /** Load weight / mechanical advantage, N. */
  effortRequired: number;
  enough: boolean;
}

/** Block and tackle: each supporting rope segment carries an equal share of the load. */
export function pulleyAnalysis(input: PulleyInput): PulleyResult {
  const loadForce = weightOf(input.loadMass);
  const segments = Math.max(1, Math.round(input.pulleys));
  const effortRequired = loadForce / segments;
  return {
    loadForce,
    segments,
    mechanicalAdvantage: segments,
    effortRequired,
    enough: isEnough(input.effort, effortRequired),
  };
}

/** Work in and out for raising the load by `rise` metres (default: the full travel). */
export function pulleyWork(input: PulleyInput, rise = PULLEY_TRAVEL): WorkResult {
  const r = pulleyAnalysis(input);
  const pulled = rise * r.segments;
  return {
    input: work(r.effortRequired, pulled),
    output: work(r.loadForce, rise),
    effortDistance: pulled,
    loadDistance: rise,
  };
}

/**
 * How the rope is threaded, which fixes the pulley count's meaning.
 *
 * Pulleys alternate between the fixed block (on the ceiling) and the moving
 * block (on the load). With an odd count the rope is tied to the moving block
 * and the first pulley is fixed; with an even count it is tied to the fixed
 * block and the first pulley is moving. Either way the rope ends by leaving a
 * fixed pulley downwards, so the user always pulls down, and the number of
 * segments between the two blocks equals the number of pulleys.
 */
export interface PulleyLayout {
  /** From the first pulley the rope meets to the last. true = on the fixed block. */
  fixed: boolean[];
  anchoredToLoad: boolean;
  fixedCount: number;
  movingCount: number;
}

export function pulleyLayout(pulleys: number): PulleyLayout {
  const n = Math.max(1, Math.round(pulleys));
  const anchoredToLoad = n % 2 === 1;
  const fixed = Array.from({ length: n }, (_, i) => (anchoredToLoad ? i % 2 === 0 : i % 2 === 1));
  const fixedCount = fixed.filter(Boolean).length;
  return { fixed, anchoredToLoad, fixedCount, movingCount: n - fixedCount };
}

/**
 * Number of rope segments that hold the load up, found by walking the rope.
 *
 * The rope runs anchor → pulley 1 → … → pulley n → hand. A run holds the load
 * up when one of its two ends sits on the moving block. The final run to the
 * hand leaves a fixed pulley, so it only carries the user's pull. For every
 * layout this equals the pulley count, which is what makes "more pulleys, more
 * advantage" true here; the drawing and the physics are both checked against it.
 */
export function supportingSegments(layout: PulleyLayout): number {
  let count = 0;
  let previousMoving = layout.anchoredToLoad;
  for (const isFixed of layout.fixed) {
    const moving = !isFixed;
    if (previousMoving || moving) count++;
    previousMoving = moving;
  }
  return count;
}
