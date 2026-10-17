/**
 * How the load moves in the Simple Machines module.
 *
 * Each machine is reduced to one number, `progress`, running from 0 (the load
 * at the bottom) to 1 (all the way up). The lever's angle, the box's place on
 * the ramp and the height of the pulley's load are all functions of it, so one
 * small integrator drives all three scenes.
 *
 *   - With enough effort the load rises at the pace of a hand: the effort moves
 *     at a steady `HAND_PACE`, so a machine that trades more distance for less
 *     force visibly takes longer to finish. That is the lesson, in motion.
 *   - With too little effort it does not rise. If it was already up it is let
 *     go, and falls back under what is left of its weight: the net force on the
 *     load is `weight × (1 − effort / required)` along its path.
 *
 * Pure and UI-free, so the animation is checked like the physics.
 */

/** How fast the user's hand moves while pushing or pulling, m/s. */
export const HAND_PACE = 1.6;
/** Bounds on how long one lift takes, s, so tiny and huge machines both stay watchable. */
export const MIN_LIFT_TIME = 1.4;
export const MAX_LIFT_TIME = 9;
/** The load never falls faster than this, m/s: it is on a rope, a ramp or a plank in someone's hands. */
export const MAX_FALL_SPEED = 2.5;
/** Seconds the load takes to get up to its lifting pace. */
const SPEED_UP_TIME = 0.25;
/** Landing slower than this makes no sound, m/s. */
export const THUD_THRESHOLD = 0.2;

export interface Motion {
  /** 0 = bottom, 1 = top */
  progress: number;
  /** Progress per second; positive is up. */
  velocity: number;
}

export interface Lane {
  /** Whether the user is pushing. Paused or not started, the load is held where it is. */
  running: boolean;
  /** Whether the effort is enough to lift the load. */
  enough: boolean;
  /** Effort / required effort. */
  ratio: number;
  /** How far the effort moves over the whole lift, m. */
  handTravel: number;
  /** How far the load moves along its path over the whole lift, m. */
  pathLength: number;
  /** The load's acceleration along its path with no effort at all, m/s². */
  fallAccel: number;
}

export type MotionEvent = { type: 'top' } | { type: 'thud'; strength: number };

export const START: Motion = { progress: 0, velocity: 0 };

/** Seconds a full lift takes at hand pace. */
export function liftDuration(handTravel: number): number {
  return Math.min(MAX_LIFT_TIME, Math.max(MIN_LIFT_TIME, handTravel / HAND_PACE));
}

/** The load's speed along its path, m/s, for a motion. */
export function loadSpeed(motion: Motion, pathLength: number): number {
  return Math.abs(motion.velocity) * pathLength;
}

export function stepMotion(
  motion: Motion,
  lane: Lane,
  dt: number
): { motion: Motion; event: MotionEvent | null } {
  let { progress: p, velocity: v } = motion;

  if (!lane.running) return { motion: { progress: p, velocity: 0 }, event: null };

  if (lane.enough) {
    if (p >= 1) return { motion: { progress: 1, velocity: 0 }, event: null };
    const target = 1 / liftDuration(lane.handTravel);
    v += (target - v) * (1 - Math.exp(-dt / SPEED_UP_TIME));
    p += v * dt;
    if (p >= 1) return { motion: { progress: 1, velocity: 0 }, event: { type: 'top' } };
    return { motion: { progress: p, velocity: v }, event: null };
  }

  // Not enough: nothing to push against if it is already at the bottom.
  if (p <= 0 && v <= 0) return { motion: START, event: null };

  const pull = Math.max(0, 1 - Math.max(0, lane.ratio));
  const accel = (lane.fallAccel * pull) / lane.pathLength; // progress / s²
  const floor = -MAX_FALL_SPEED / lane.pathLength;
  v = Math.max(floor, v - accel * dt);
  p += v * dt;

  if (p <= 0) {
    const impact = -v * lane.pathLength;
    const event: MotionEvent | null =
      impact > THUD_THRESHOLD ? { type: 'thud', strength: Math.min(1, impact / MAX_FALL_SPEED) } : null;
    return { motion: START, event };
  }
  return { motion: { progress: p, velocity: v }, event: null };
}

export type MotionStatus = 'idle' | 'lifting' | 'blocked' | 'falling' | 'done' | 'paused';

/** What is going on, in words the page can pick a message for. */
export function motionStatus(motion: Motion, lane: Pick<Lane, 'running' | 'enough'>, started: boolean): MotionStatus {
  const up = motion.progress >= 1;
  if (!lane.running) {
    if (up) return 'done';
    return started || motion.progress > 0 ? 'paused' : 'idle';
  }
  if (lane.enough) return up ? 'done' : 'lifting';
  return motion.progress > 0 || motion.velocity > 0 ? 'falling' : 'blocked';
}
