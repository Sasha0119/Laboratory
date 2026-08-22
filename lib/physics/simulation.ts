/**
 * The simulation runner.
 *
 * `Simulator` is a plain, UI-free state machine: construct it with a set of
 * parameters, then call `step(dt)` with a fixed timestep until it reports
 * `finished`. The render loop drives it; nothing in here imports React or
 * touches the screen, which is what makes the whole thing unit-testable.
 *
 * Two integration paths, chosen once at construction:
 *   - No air (toggle off, or a vacuum environment): the closed-form
 *     constant-acceleration solution, evaluated at absolute time t. Exact,
 *     no accumulated error, and mass-independent by construction.
 *   - Air: RK4 on the drag ODE, stepped forward. The spec's requirement that
 *     drag runs through a real numerical integrator rather than the analytic
 *     equations is enforced by this branch never calling `stateAt`.
 */

import {
  ENVIRONMENTS,
  MAX_SIM_TIME,
  type EnvironmentId,
} from './constants';
import {
  buildDragModel,
  refineGroundCrossing,
  rk4Step,
  terminalVelocity,
  type BodyProperties,
  type DragModel,
  type State,
} from './drag';
import {
  apexHeight,
  horizontalRange,
  resolveLaunch,
  stateAt,
  timeOfFlight,
  type LaunchState,
} from './kinematics';

export interface SimParams extends BodyProperties {
  /** Release height above ground, m. */
  dropHeight: number;
  /** Initial speed, m/s. Zero means a pure drop. */
  speed: number;
  /** Launch angle above the horizontal in degrees: 0 = flat throw, 90 = straight up. */
  angleDeg: number;
  environmentId: EnvironmentId;
  airResistance: boolean;
}

export type SimOutcome =
  | 'running'
  | 'landed'
  /** Zero-G only: drifted into a wall of the chamber. */
  | 'boundary'
  /** Still going when the time cap was reached (e.g. a feather on a long fall). */
  | 'timeout'
  /** Zero-G with no initial velocity: no net force, so nothing ever happens. */
  | 'floating';

export interface SimSample {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Magnitude of velocity, m/s. */
  speed: number;
}

export interface SimResult {
  outcome: Exclude<SimOutcome, 'running'>;
  /** Seconds of simulated flight. */
  totalTime: number;
  /** Highest point reached above the ground, m. */
  maxHeight: number;
  /** Whether the object actually rose above its release point. */
  rose: boolean;
  /** Speed at the moment of contact, m/s. */
  impactSpeed: number;
  /** Vertical component at contact (negative = downward), m/s. */
  impactVy: number;
  /** 0.5 m v^2 at contact, joules. */
  impactEnergy: number;
  /** Horizontal distance travelled, m. */
  distance: number;
  /** sqrt(g/k), or Infinity without air. */
  terminalVelocity: number;
  /** Regularly spaced samples for the graphs. */
  samples: SimSample[];
}

/**
 * Zero-G has no floor, so the object drifts until it reaches the wall of an
 * imaginary chamber. The chamber is derived from the drop height alone so the
 * viewport can be sized before the trajectory is known.
 */
export function zeroGChamber(dropHeight: number) {
  return {
    minY: 0,
    maxY: Math.max(dropHeight * 1.6, dropHeight + 5),
    halfWidth: Math.max(dropHeight * 0.9, 4),
  };
}

export class Simulator {
  readonly params: SimParams;
  readonly model: DragModel;
  readonly launch: LaunchState;
  readonly hasGround: boolean;
  readonly usesDrag: boolean;
  readonly chamber: ReturnType<typeof zeroGChamber>;

  state: State;
  t = 0;
  outcome: SimOutcome = 'running';
  maxHeight: number;
  /** Every position visited, for the on-canvas trail. */
  path: { x: number; y: number }[] = [];
  samples: SimSample[] = [];

  private lastSampleT = -Infinity;
  private sampleInterval: number;

  constructor(params: SimParams, sampleInterval = 1 / 60) {
    this.params = params;
    const env = ENVIRONMENTS[params.environmentId];
    this.model = buildDragModel(params, env, params.airResistance);
    this.usesDrag = this.model.k > 0;
    this.hasGround = env.hasGround;
    this.chamber = zeroGChamber(params.dropHeight);
    this.sampleInterval = sampleInterval;

    const v = resolveLaunch(params.speed, params.angleDeg);
    this.launch = { y0: params.dropHeight, vx0: v.x, vy0: v.y };
    this.state = { x: 0, y: params.dropHeight, vx: v.x, vy: v.y };
    this.maxHeight = params.dropHeight;

    // Zero-G with nothing pushing it: the object is already in equilibrium.
    if (!this.hasGround && this.model.g === 0 && params.speed === 0) {
      this.outcome = 'floating';
    }

    this.record(true);
  }

  get finished(): boolean {
    return this.outcome !== 'running';
  }

  get speed(): number {
    return Math.hypot(this.state.vx, this.state.vy);
  }

  /** Height above the ground, clamped at zero for display purposes. */
  get height(): number {
    return Math.max(this.state.y, 0);
  }

  /**
   * Advance the simulation by exactly `dt` seconds.
   * Returns true if this step ended the run.
   */
  step(dt: number): boolean {
    if (this.finished) return true;

    const before = this.state;
    let next: State;
    let consumed = dt;

    if (this.usesDrag) {
      // Air resistance on: integrate numerically, never analytically.
      next = rk4Step(before, this.model, dt);
    } else {
      // Vacuum: evaluate the exact solution at the new absolute time. This
      // avoids drift entirely over long flights.
      next = stateAt(this.launch, this.model.g, this.t + dt);
    }

    // --- Ground contact -------------------------------------------------
    if (this.hasGround && next.y <= 0 && before.y > 0) {
      if (this.usesDrag) {
        const refined = refineGroundCrossing(before, this.model, dt);
        next = refined.state;
        consumed = refined.dt;
      } else {
        // Exact landing time from the quadratic; no search needed.
        const tLand = timeOfFlight(this.launch.y0, this.launch.vy0, this.model.g);
        consumed = Math.max(tLand - this.t, 0);
        next = { ...stateAt(this.launch, this.model.g, tLand), y: 0 };
      }
      this.commit(next, consumed);
      this.outcome = 'landed';
      return true;
    }

    // --- Zero-G chamber walls -------------------------------------------
    if (!this.hasGround) {
      const { minY, maxY, halfWidth } = this.chamber;
      if (next.y <= minY || next.y >= maxY || Math.abs(next.x) >= halfWidth) {
        this.commit(next, consumed);
        this.outcome = 'boundary';
        return true;
      }
    }

    this.commit(next, consumed);

    if (this.t >= MAX_SIM_TIME) {
      this.outcome = this.model.g === 0 && this.speed === 0 ? 'floating' : 'timeout';
      return true;
    }
    return false;
  }

  private commit(next: State, dt: number) {
    this.state = next;
    this.t += dt;
    if (next.y > this.maxHeight) this.maxHeight = next.y;
    this.record(false);
  }

  private record(force: boolean) {
    const last = this.path[this.path.length - 1];
    // Thin the trail: only keep a point once the object has actually moved.
    if (force || !last || Math.hypot(this.state.x - last.x, this.state.y - last.y) > 1e-4) {
      this.path.push({ x: this.state.x, y: this.state.y });
    }
    if (force || this.t - this.lastSampleT >= this.sampleInterval) {
      this.lastSampleT = this.t;
      this.samples.push({
        t: this.t,
        x: this.state.x,
        y: this.state.y,
        vx: this.state.vx,
        vy: this.state.vy,
        speed: this.speed,
      });
    }
  }

  /** Snapshot of the finished run, for the results card and the graphs. */
  result(): SimResult {
    const speed = this.speed;
    // Make sure the final state is represented in the graph data.
    const last = this.samples[this.samples.length - 1];
    if (!last || last.t < this.t - 1e-9) {
      this.samples.push({
        t: this.t,
        x: this.state.x,
        y: this.state.y,
        vx: this.state.vx,
        vy: this.state.vy,
        speed,
      });
    }
    return {
      outcome: this.outcome === 'running' ? 'timeout' : this.outcome,
      totalTime: this.t,
      maxHeight: this.maxHeight,
      rose: this.maxHeight > this.params.dropHeight + 1e-6,
      impactSpeed: speed,
      impactVy: this.state.vy,
      impactEnergy: 0.5 * this.params.mass * speed * speed,
      distance: Math.abs(this.state.x),
      terminalVelocity: terminalVelocity(this.model),
      samples: this.samples,
    };
  }
}

/**
 * Run a whole trajectory to completion without animating it.
 *
 * Used for two things: sizing the viewport before the run starts (so the
 * camera never has to rescale mid-flight), and the unit tests. Because the
 * integrator is deterministic and the timestep is fixed, this produces bit-for-bit
 * the same path the animated run will follow.
 */
export function simulate(params: SimParams, dt: number, sampleInterval = 1 / 60): SimResult {
  const sim = new Simulator(params, sampleInterval);
  let guard = Math.ceil(MAX_SIM_TIME / dt) + 10;
  while (!sim.finished && guard-- > 0) {
    sim.step(dt);
  }
  return sim.result();
}

/**
 * Bounding box the camera should frame, in world metres.
 *
 * Deliberately computed from the DRAG-FREE closed-form solution rather than
 * from the actual trajectory. Drag is a purely dissipative force here — there
 * is no wind — so it can only lower the apex and shorten the range. The
 * vacuum envelope is therefore guaranteed to contain the real path, whatever
 * the object and atmosphere.
 *
 * Two things fall out of that. It costs nothing to evaluate, so the camera can
 * be reframed live while a slider is being dragged; and it does not change
 * when the run starts, so the view never jumps at launch. For a pure vertical
 * drop — by far the most common case — the envelope is exactly tight.
 */
export function analyticBounds(params: SimParams) {
  const env = ENVIRONMENTS[params.environmentId];

  if (!env.hasGround) {
    const c = zeroGChamber(params.dropHeight);
    return { minX: -c.halfWidth, maxX: c.halfWidth, minY: c.minY, maxY: c.maxY };
  }

  const v = resolveLaunch(params.speed, params.angleDeg);
  const apex = apexHeight(params.dropHeight, v.y, env.gravity);
  const range = horizontalRange(params.dropHeight, v.x, v.y, env.gravity);

  return {
    minX: 0,
    maxX: Number.isFinite(range) ? Math.max(range, 0) : params.dropHeight,
    minY: 0,
    // A little headroom so the object is never flush against the top edge.
    maxY: Math.max(Number.isFinite(apex) ? apex : params.dropHeight, 0.5) * 1.06,
  };
}
