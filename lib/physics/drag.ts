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
 * enough to run 240 steps a second (more when drag is stiff) without noticing.
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
 *
 * RK4 alone is still only conditionally stable: call `integrate()` rather than
 * this function directly, so a very stiff step is split into safe sub-steps.
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
 * Largest value of k·|v|·h a single RK4 sub-step may take.
 *
 * Why a limit is needed at all: linearising the drag term around the current
 * velocity gives a decay rate of 2·k·|v| along the direction of travel (k·|v|
 * across it). RK4 is only stable while h·λ stays inside its stability region,
 * about 2.78 on the negative real axis. A feather launched at 50 m/s has
 * k·|v| ≈ 770 /s, so one 1/240 s step gives h·λ ≈ 6.4 — far outside it, and
 * each step multiplies the error instead of damping it. That is the "stiff"
 * case that used to blow up to millions of m/s in a few milliseconds.
 *
 * 0.1 keeps h·λ ≤ 0.2: an order of magnitude inside the stability limit, and
 * small enough that the per-step truncation error (~(h·λ)^5 / 120) is
 * negligible. Every ordinary case (ball, marble, book, a feather dropped from
 * rest) already satisfies it with the full frame step, so for those the
 * integration is exactly one RK4 step, bit-for-bit what it was before.
 */
export const MAX_STIFFNESS_PER_STEP = 0.1;

/** Upper bound on sub-steps in one call, so a corrupt input cannot hang a frame. */
const MAX_SUBSTEPS = 100_000;

/**
 * Advance the state by `dt` seconds, splitting the interval into as many RK4
 * sub-steps as the drag stiffness requires (adaptive sub-stepping).
 *
 * The sub-step length is chosen from the state at the start of each sub-step:
 *
 *     h = min( remaining, MAX_STIFFNESS_PER_STEP / (k·|v|) )
 *
 * Drag can only reduce |v| once it is above terminal velocity, so the speed —
 * and with it the stiffness — never grows by much inside a sub-step chosen
 * this way. A fast, very light object therefore takes many tiny sub-steps
 * during the first few milliseconds while drag brakes it hard, then settles
 * back to one or two per frame near terminal velocity. Because the split
 * depends only on the state, the result is still fully deterministic, and the
 * animated run and `simulate()` follow the identical path.
 */
export function integrate(s: State, m: DragModel, dt: number): State {
  if (dt <= 0) return s;
  if (m.k <= 0) return rk4Step(s, m, dt);

  let state = s;
  let remaining = dt;
  let guard = MAX_SUBSTEPS;
  while (remaining > 0 && guard-- > 0) {
    const rate = m.k * Math.hypot(state.vx, state.vy);
    let h = rate > 0 ? Math.min(remaining, MAX_STIFFNESS_PER_STEP / rate) : remaining;
    // Avoid leaving a sliver of time that would cost a whole extra sub-step.
    if (remaining - h < h * 1e-6) h = remaining;
    state = rk4Step(state, m, h);
    remaining -= h;
  }
  return state;
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
  let best = integrate(before, m, dt);

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const candidate = integrate(before, m, mid);
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
