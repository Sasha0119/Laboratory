/**
 * Closed-form kinematics for the drag-free case.
 *
 * These are the exact solutions of constant-acceleration motion. They are used
 * for three things:
 *   1. Stepping the simulation when air resistance is off or rho = 0, where the
 *      analytic answer is exact and free.
 *   2. Sizing the viewport before a run (apex, range, flight time).
 *   3. Checking the numerical integrator in the unit tests — with drag
 *      disabled, RK4 must reproduce these to within rounding error.
 *
 * Convention: +y up, y = 0 is ground, gravity contributes (0, -g).
 * No object property appears anywhere below, which is the whole point:
 * without air, a feather and a hammer follow identical paths.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface LaunchState {
  /** Starting height above ground, m. */
  y0: number;
  /** Initial horizontal velocity, m/s. */
  vx0: number;
  /** Initial vertical velocity, m/s (positive is upward). */
  vy0: number;
}

/**
 * Split a speed and a launch angle into velocity components.
 *
 * `angleDeg` is measured up from the horizontal:
 *   0 deg  -> pure horizontal throw
 *   90 deg -> straight up
 */
export function resolveLaunch(speed: number, angleDeg: number): Vec2 {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: speed * Math.cos(rad),
    y: speed * Math.sin(rad),
  };
}

/** x(t) = x0 + vx0 * t   (no horizontal force without drag) */
export function positionX(vx0: number, t: number, x0 = 0): number {
  return x0 + vx0 * t;
}

/** y(t) = y0 + vy0 * t - 0.5 * g * t^2 */
export function positionY(y0: number, vy0: number, g: number, t: number): number {
  return y0 + vy0 * t - 0.5 * g * t * t;
}

/** vy(t) = vy0 - g * t */
export function velocityY(vy0: number, g: number, t: number): number {
  return vy0 - g * t;
}

/**
 * Time for an object released from rest at height h to reach the ground:
 *
 *     h = 0.5 * g * t^2   ->   t = sqrt(2h / g)
 *
 * Returns Infinity in zero gravity, where it never arrives.
 */
export function timeToFall(h: number, g: number): number {
  if (g <= 0) return Infinity;
  if (h <= 0) return 0;
  return Math.sqrt((2 * h) / g);
}

/**
 * Height of the top of the arc. Only above y0 when the object was thrown
 * upward; otherwise the launch point is already the highest it ever gets.
 *
 * At the apex vy = 0, so t_apex = vy0 / g and
 *     y_apex = y0 + vy0^2 / (2g)
 */
export function apexHeight(y0: number, vy0: number, g: number): number {
  if (vy0 <= 0 || g <= 0) return y0;
  return y0 + (vy0 * vy0) / (2 * g);
}

/** Time at which the apex is reached (0 if the object never rises). */
export function timeToApex(vy0: number, g: number): number {
  if (vy0 <= 0 || g <= 0) return 0;
  return vy0 / g;
}

/**
 * Total time in the air before y returns to 0, from
 *
 *     0 = y0 + vy0 * t - 0.5 * g * t^2
 *
 * Solved with the quadratic formula, taking the positive root:
 *
 *     t = ( vy0 + sqrt(vy0^2 + 2 * g * y0) ) / g
 *
 * With g = 0 the object never lands unless it is already falling, in which
 * case it takes y0 / -vy0 seconds.
 */
export function timeOfFlight(y0: number, vy0: number, g: number): number {
  if (y0 <= 0 && vy0 <= 0) return 0;
  if (g <= 0) {
    if (vy0 >= 0) return Infinity;
    return y0 / -vy0;
  }
  const disc = vy0 * vy0 + 2 * g * y0;
  if (disc < 0) return 0; // unreachable for y0 >= 0, guarded for safety
  return (vy0 + Math.sqrt(disc)) / g;
}

/** Speed on arrival: sqrt(vx^2 + vy^2) at t = timeOfFlight. */
export function impactSpeed(
  y0: number,
  vx0: number,
  vy0: number,
  g: number
): number {
  const t = timeOfFlight(y0, vy0, g);
  if (!Number.isFinite(t)) return Number.isFinite(vx0) ? Math.hypot(vx0, vy0) : 0;
  const vy = velocityY(vy0, g, t);
  return Math.hypot(vx0, vy);
}

/** Horizontal distance covered before landing. */
export function horizontalRange(
  y0: number,
  vx0: number,
  vy0: number,
  g: number
): number {
  const t = timeOfFlight(y0, vy0, g);
  if (!Number.isFinite(t)) return Infinity;
  return vx0 * t;
}

/**
 * Exact state at time t under constant gravity. Used as the integrator's
 * fast path whenever the air density is zero.
 */
export function stateAt(
  launch: LaunchState,
  g: number,
  t: number
): { x: number; y: number; vx: number; vy: number } {
  return {
    x: positionX(launch.vx0, t),
    y: positionY(launch.y0, launch.vy0, g, t),
    vx: launch.vx0,
    vy: velocityY(launch.vy0, g, t),
  };
}
