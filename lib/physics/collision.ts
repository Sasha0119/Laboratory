/**
 * One-dimensional collisions on a frictionless horizontal track.
 *
 * Sign convention: +x is to the right. A negative velocity moves left.
 * Body A starts on the left, body B on the right.
 *
 * Between contacts there are no forces at all — no gravity component along a
 * level track, no friction — so motion is exactly uniform and `x += v*dt` is
 * not an approximation. That also means the contact instant can be solved in
 * closed form rather than searched for, which is what `timeToContact` does.
 *
 * The one law that holds in every case here is conservation of momentum:
 *
 *     m1*v1 + m2*v2 = m1*v1' + m2*v2'
 *
 * Kinetic energy is only conserved when the collision is perfectly elastic.
 * The unit tests assert both of those statements directly.
 */

/** How bouncy the collision is, in plain language. */
export type CollisionKind = 'bouncy' | 'sticky' | 'realistic';

/** Default coefficient of restitution for the "realistic" setting. */
export const DEFAULT_RESTITUTION = 0.7;

export interface BodyState {
  /** kg */
  mass: number;
  /** m/s, positive is rightward */
  velocity: number;
  /** m, centre of the body */
  position: number;
  /**
   * Half-width used for contact, in metres.
   *
   * This is the DRAWN half-width, so objects collide exactly when they look
   * like they touch. Note that the radius affects only *where and when*
   * contact happens — the resulting velocities depend solely on the masses,
   * the incoming velocities and the restitution, so enlarging a marble to
   * keep it visible cannot distort the physics being demonstrated.
   */
  radius: number;
}

/**
 * Coefficient of restitution, e — the ratio of separation speed to approach
 * speed. e = 1 loses no energy, e = 0 means the bodies move off together.
 */
export function restitutionFor(kind: CollisionKind, custom = DEFAULT_RESTITUTION): number {
  if (kind === 'bouncy') return 1;
  if (kind === 'sticky') return 0;
  return Math.min(1, Math.max(0, custom));
}

/**
 * Velocities after a one-dimensional impact.
 *
 * Solving momentum conservation together with the restitution definition
 *
 *     v2' - v1' = e * (v1 - v2)
 *
 * gives, with M = m1 + m2:
 *
 *     v1' = ( m1*v1 + m2*v2 + m2*e*(v2 - v1) ) / M
 *     v2' = ( m1*v1 + m2*v2 + m1*e*(v1 - v2) ) / M
 *
 * Substituting e = 1 reproduces the familiar elastic pair
 *
 *     v1' = ((m1-m2)/M)*v1 + (2*m2/M)*v2
 *     v2' = (2*m1/M)*v1 + ((m2-m1)/M)*v2
 *
 * and e = 0 collapses both to the common velocity (m1*v1 + m2*v2)/M.
 * Momentum comes out conserved for every e, which is the point.
 */
export function resolveCollision(
  m1: number,
  v1: number,
  m2: number,
  v2: number,
  e: number
): { v1: number; v2: number } {
  const total = m1 + m2;
  const p = m1 * v1 + m2 * v2;
  return {
    v1: (p + m2 * e * (v2 - v1)) / total,
    v2: (p + m1 * e * (v1 - v2)) / total,
  };
}

/** Total momentum, kg·m/s. Must be identical before and after any collision. */
export function momentum(a: BodyState, b: BodyState): number {
  return a.mass * a.velocity + b.mass * b.velocity;
}

/** Total kinetic energy, joules. Falls whenever e < 1. */
export function kineticEnergy(a: BodyState, b: BodyState): number {
  return 0.5 * a.mass * a.velocity ** 2 + 0.5 * b.mass * b.velocity ** 2;
}

/** Gap between the facing edges of A and B, in metres. Negative means overlap. */
export function gapBetween(a: BodyState, b: BodyState): number {
  return b.position - b.radius - (a.position + a.radius);
}

/**
 * Seconds until the two bodies touch, or Infinity if they never will.
 * Exact, because both bodies travel at constant velocity between contacts.
 */
export function timeToContact(a: BodyState, b: BodyState): number {
  const closingSpeed = a.velocity - b.velocity;
  if (closingSpeed <= 0) return Infinity; // separating or matched
  const gap = gapBetween(a, b);
  if (gap <= 0) return 0;
  return gap / closingSpeed;
}

export interface CollisionEvent {
  time: number;
  /** Where the bodies met, in metres along the track. */
  position: number;
  /** How fast they were closing, m/s. */
  approachSpeed: number;
  aBefore: number;
  bBefore: number;
  aAfter: number;
  bAfter: number;
  restitution: number;
  energyBefore: number;
  energyAfter: number;
  /** Joules turned into heat, sound and deformation. Zero only when e = 1. */
  energyLost: number;
  momentumBefore: number;
  momentumAfter: number;
  stuck: boolean;
}

export interface CollisionParams {
  a: BodyState;
  b: BodyState;
  kind: CollisionKind;
  /** Only consulted when kind is 'realistic'. */
  restitution: number;
  /** The track runs from -halfTrack to +halfTrack, with end stops. */
  halfTrack: number;
}

export type CollisionOutcome = 'running' | 'settled' | 'no-contact' | 'timeout';

/** How long to keep animating after the impact before freezing the result. */
export const POST_IMPACT_TIME = 2.5;
export const MAX_COLLISION_TIME = 30;

/**
 * Steps two bodies along the track. UI-free, deterministic, and driven by the
 * caller's fixed timestep exactly like the drop simulator.
 */
export class CollisionSimulator {
  readonly params: CollisionParams;
  readonly restitution: number;

  a: BodyState;
  b: BodyState;
  t = 0;
  outcome: CollisionOutcome = 'running';
  event: CollisionEvent | null = null;
  stuck = false;

  /** Position history for the motion trails. */
  trailA: number[] = [];
  trailB: number[] = [];

  private sinceImpact = 0;

  constructor(params: CollisionParams) {
    this.params = params;
    this.restitution = restitutionFor(params.kind, params.restitution);
    this.a = { ...params.a };
    this.b = { ...params.b };

    // If they are already moving apart (or both still), they never meet.
    if (!Number.isFinite(timeToContact(this.a, this.b))) {
      if (this.a.velocity === 0 && this.b.velocity === 0) this.outcome = 'no-contact';
    }
  }

  get finished(): boolean {
    return this.outcome !== 'running';
  }

  /** Advance by exactly `dt` seconds. Returns true when the run has ended. */
  step(dt: number): boolean {
    if (this.finished) return true;

    let remaining = dt;
    // Event-driven within the frame: find whichever happens first — the
    // bodies touching, or either body reaching an end stop — advance exactly
    // to it, handle it, and repeat. Handling wall hits as events (rather than
    // clamping after the fact) matters: if one body were clamped mid-step,
    // its partner would carry on into it and overlap.
    //
    // Usually there is at most one event per frame; a body bouncing between
    // its partner and a wall can produce a few. Every event leaves the bodies
    // separating or stopped, so the loop never spins on the same touch, and
    // the guard only bounds a pathological case.
    let guard = 16;
    while (remaining > 1e-12 && guard-- > 0) {
      if (this.stuck) {
        // The joined pair is handled as one rigid body by `advance`.
        this.advance(remaining);
        break;
      }

      const tc = timeToContact(this.a, this.b);
      const ta = this.timeToWall(this.a);
      const tb = this.timeToWall(this.b);
      const next = Math.min(tc, ta, tb);

      if (next > remaining) {
        this.advance(remaining);
        break;
      }

      this.advance(next);
      remaining -= next;
      if (next === tc) {
        this.resolve();
      } else {
        if (next === ta) this.stopAtWall(this.a);
        if (next === tb) this.stopAtWall(this.b);
      }
    }

    this.t += dt;
    if (this.event) this.sinceImpact += dt;

    this.record();
    this.checkEnd();
    return this.finished;
  }

  /** Uniform motion for `dt`, then clamp against the end stops. */
  private advance(dt: number) {
    if (dt <= 0) return;
    this.a.position += this.a.velocity * dt;
    this.b.position += this.b.velocity * dt;

    if (this.stuck) {
      // Treat the joined pair as one rigid body so it cannot be split by a wall.
      const left = this.a.position - this.a.radius;
      const right = this.b.position + this.b.radius;
      const h = this.params.halfTrack;
      let shift = 0;
      if (left < -h) shift = -h - left;
      else if (right > h) shift = h - right;
      if (shift !== 0) {
        this.a.position += shift;
        this.b.position += shift;
        this.a.velocity = 0;
        this.b.velocity = 0;
      }
      return;
    }

    this.clampToTrack(this.a);
    this.clampToTrack(this.b);
  }

  /** Seconds until `body` reaches the end stop it is heading for (Infinity if at rest). */
  private timeToWall(body: BodyState): number {
    const h = this.params.halfTrack;
    if (body.velocity > 0) return Math.max((h - body.radius - body.position) / body.velocity, 0);
    if (body.velocity < 0) return Math.max((body.position - body.radius + h) / -body.velocity, 0);
    return Infinity;
  }

  /** End stops absorb the impact: the body is placed exactly on the wall, at rest. */
  private stopAtWall(body: BodyState) {
    const h = this.params.halfTrack;
    body.position = body.velocity > 0 ? h - body.radius : -h + body.radius;
    body.velocity = 0;
  }

  /**
   * Safety net only: the step loop stops bodies at the walls as exact events,
   * so this should never move anything. It catches rounding at the boundary.
   */
  private clampToTrack(body: BodyState) {
    const h = this.params.halfTrack;
    if (body.position - body.radius < -h) {
      body.position = -h + body.radius;
      body.velocity = 0;
    } else if (body.position + body.radius > h) {
      body.position = h - body.radius;
      body.velocity = 0;
    }
  }

  /**
   * Whether `body` is pressed against the end stop on the given side: it sits
   * on the wall, so it cannot move any further that way.
   */
  private pinned(body: BodyState, side: 'left' | 'right'): boolean {
    const h = this.params.halfTrack;
    const eps = 1e-9;
    return side === 'right'
      ? body.position + body.radius >= h - eps
      : body.position - body.radius <= -h + eps;
  }

  private resolve() {
    if (this.event) {
      this.resolveRepeatContact();
      return;
    }

    const before = { a: this.a.velocity, b: this.b.velocity };
    const energyBefore = kineticEnergy(this.a, this.b);
    const momentumBefore = momentum(this.a, this.b);
    const approachSpeed = before.a - before.b;
    const contactPoint = this.a.position + this.a.radius;

    const next = resolveCollision(
      this.a.mass,
      before.a,
      this.b.mass,
      before.b,
      this.restitution
    );
    this.a.velocity = next.v1;
    this.b.velocity = next.v2;

    if (this.params.kind === 'sticky') {
      this.stuck = true;
      // Lock them at exactly touching so they render as one object.
      this.b.position = this.a.position + this.a.radius + this.b.radius;
    }

    const energyAfter = kineticEnergy(this.a, this.b);
    this.event = {
      time: this.t,
      position: contactPoint,
      approachSpeed,
      aBefore: before.a,
      bBefore: before.b,
      aAfter: next.v1,
      bAfter: next.v2,
      restitution: this.restitution,
      energyBefore,
      energyAfter,
      energyLost: energyBefore - energyAfter,
      momentumBefore,
      momentumAfter: momentum(this.a, this.b),
      stuck: this.params.kind === 'sticky',
    };
    this.sinceImpact = 0;
  }

  /**
   * A later touch, after the collision the run is about.
   *
   * This happens when one body has already been stopped by an end stop and
   * the other catches up with it. The stopped body is pinned between its
   * partner and the wall, so it cannot move: together with the wall it acts
   * as an immovable object, and the arriving body rebounds with the same
   * restitution as the main collision (e = 0 simply stops it). Any velocity
   * the pinned body had into the wall is absorbed, just as the wall itself
   * absorbs impacts.
   *
   * If neither body is pinned (both free, e.g. one came to rest mid-track
   * after a sticky-like hit), the ordinary two-body formula applies.
   *
   * Either way the bodies end up separating or both at rest, so the contact
   * cannot repeat in zero time. Previously this touch was ignored entirely,
   * which left the arriving body frozen against its partner while its
   * velocity — and the speed on screen — stayed non-zero.
   *
   * The recorded `event` is not changed: it describes the main collision.
   */
  private resolveRepeatContact() {
    if (this.stuck) return;
    const { a, b } = this;
    const e = this.restitution;

    if (this.pinned(b, 'right')) {
      b.velocity = 0;
      a.velocity = Math.abs(a.velocity) < 1e-9 ? 0 : -e * a.velocity;
    } else if (this.pinned(a, 'left')) {
      a.velocity = 0;
      b.velocity = Math.abs(b.velocity) < 1e-9 ? 0 : -e * b.velocity;
    } else {
      const next = resolveCollision(a.mass, a.velocity, b.mass, b.velocity, e);
      a.velocity = next.v1;
      b.velocity = next.v2;
    }
    // Below this, the "motion" is rounding noise; call it rest so the run settles.
    if (Math.abs(a.velocity) < 1e-6) a.velocity = 0;
    if (Math.abs(b.velocity) < 1e-6) b.velocity = 0;
  }

  private record() {
    const push = (arr: number[], v: number) => {
      if (arr.length === 0 || Math.abs(arr[arr.length - 1] - v) > 1e-4) arr.push(v);
      if (arr.length > 60) arr.shift();
    };
    push(this.trailA, this.a.position);
    push(this.trailB, this.b.position);
  }

  private checkEnd() {
    const atRest =
      Math.abs(this.a.velocity) < 1e-6 && Math.abs(this.b.velocity) < 1e-6;

    if (this.event) {
      if (atRest || this.sinceImpact >= POST_IMPACT_TIME) this.outcome = 'settled';
    } else if (atRest) {
      // Everything has come to a stop and they never met.
      this.outcome = 'no-contact';
    }

    if (!this.finished && this.t >= MAX_COLLISION_TIME) {
      this.outcome = this.event ? 'settled' : 'no-contact';
    }
  }
}

/** Run a collision to completion without animating it. Used by the tests. */
export function simulateCollision(params: CollisionParams, dt: number): CollisionSimulator {
  const sim = new CollisionSimulator(params);
  let guard = Math.ceil(MAX_COLLISION_TIME / dt) + 10;
  while (!sim.finished && guard-- > 0) sim.step(dt);
  return sim;
}
