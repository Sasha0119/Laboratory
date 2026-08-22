/**
 * Quadratic (Newtonian) air drag and the RK4 integrator that goes with it.
 *
 * Drag force magnitude:
 *
 *     F_drag = 0.5 * rho * v^2 * Cd * A
 *
 * It always opposes the direction of travel, so in vector form
 *
 *     F_drag = -0.5 * rho * Cd * A * |v| * v
 *
 * and the acceleration of the body is
 *
 *     a = (0, -g) + F_drag / m
 *       = (0, -g) - (0.5 * rho * Cd * A / m) * |v| * v
 *
 * The bracketed group is constant for a given object and atmosphere, so we
 * precompute it once as `k` (units: 1 / m). That makes the derivative cheap
 * enough to run 240 substeps a second without noticing.
 *
 * Note that `m` appears only in `k`. When rho = 0, k = 0 and mass drops out of
 * the equations entirely — which is exactly why a feather and a hammer land
 * together in a vacuum.
 */

import type { Environment } from './constants';

export interface BodyProperties {
  /** kg */
  mass: number;
  /** dimensionless */
  dragCoefficient: number;
  /** m^2 */
  area: number;
}

/** Full mechanical state of the body. */
export interface State {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface DragModel {
  /** Gravitational acceleration magnitude, m/s^2. */
  g: number;
  /**
   * Combined drag constant k = 0.5 * rho * Cd * A / m, in 1/m.
   * Zero means "no air" and the motion reduces to pure ballistics.
   */
  k: number;
}

/**
 * Build the model actually used by the integrator.
 *
 * `airResistanceEnabled` is the user's toggle. It can only ever turn drag off:
 * a vacuum environment (Moon, Zero-G) has rho = 0 and stays drag-free whatever
 * the toggle says, which is the physically honest behaviour.
 */
export function buildDragModel(
  body: BodyProperties,
  env: Environment,
  airResistanceEnabled: boolean
): DragModel {
  const rho = airResistanceEnabled ? env.airDensity : 0;
  const mass = Math.max(body.mass, 1e-9); // guard against divide-by-zero
  const k = (0.5 * rho * body.dragCoefficient * body.area) / mass;
  return { g: env.gravity, k };
}

/**
 * Terminal velocity: the speed at which drag exactly cancels weight.
 *
 *     m g = 0.5 * rho * Cd * A * v^2   ->   v = sqrt( 2 m g / (rho Cd A) )
 *
 * In terms of the precomputed k this is simply sqrt(g / k).
 * Returns Infinity when there is no air (the object never stops accelerating).
 */
export function terminalVelocity(model: DragModel): number {
  if (model.k <= 0 || model.g <= 0) return Infinity;
  return Math.sqrt(model.g / model.k);
}

/**
 * Time derivative of the state vector: (dx/dt, dy/dt, dvx/dt, dvy/dt).
 * Position differentiates to velocity; velocity differentiates to acceleration.
 */
export function derivative(s: State, m: DragModel): State {
  const speed = Math.hypot(s.vx, s.vy);
  // |v| * v gives the quadratic magnitude while keeping the sign of each
  // component, so drag opposes motion on both axes automatically.
  const dragX = -m.k * speed * s.vx;
  const dragY = -m.k * speed * s.vy;
  return {
    x: s.vx,
    y: s.vy,
    vx: dragX,
    vy: -m.g + dragY,
  };
}

function addScaled(s: State, d: State, h: number): State {
  return {
    x: s.x + d.x * h,
    y: s.y + d.y * h,
    vx: s.vx + d.vx * h,
    vy: s.vy + d.vy * h,
  };
}

/**
 * One classical fourth-order Runge-Kutta step.
 *
 * RK4 is used rather than Euler because drag makes the system stiff near
 * terminal velocity: Euler at 1/240 s overshoots and oscillates for a light
 * object like the feather, while RK4 tracks the analytic solution to within
 * a fraction of a percent. With k = 0 it integrates the drag-free case
 * exactly, since the derivative is then at most linear in t.
 */
export function rk4Step(s: State, m: DragModel, dt: number): State {
  const k1 = derivative(s, m);
  const k2 = derivative(addScaled(s, k1, dt / 2), m);
  const k3 = derivative(addScaled(s, k2, dt / 2), m);
  const k4 = derivative(addScaled(s, k3, dt), m);

  return {
    x: s.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: s.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    vx: s.vx + (dt / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
    vy: s.vy + (dt / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy),
  };
}

/**
 * Find the exact moment within a step at which the body crossed y = 0.
 *
 * Landing almost never coincides with a step boundary, and simply clamping y
 * to 0 would report an impact speed that is up to one step stale. Instead we
 * bisect the interval [0, dt], re-integrating from the known-good previous
 * state each time, until the crossing is located to sub-microsecond precision.
 * The returned state sits on the ground with the correct impact velocity.
 */
export function refineGroundCrossing(
  before: State,
  m: DragModel,
  dt: number,
  groundY = 0
): { state: State; dt: number } {
  let lo = 0;
  let hi = dt;
  let best = rk4Step(before, m, dt);

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const candidate = rk4Step(before, m, mid);
    if (candidate.y <= groundY) {
      hi = mid;
      best = candidate;
    } else {
      lo = mid;
    }
    if (hi - lo < 1e-9) break;
  }

  // Snap the residual (sub-nanometre) penetration away without touching velocity.
  return { state: { ...best, y: groundY }, dt: hi };
}
