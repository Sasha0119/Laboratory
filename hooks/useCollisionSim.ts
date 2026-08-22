/**
 * Frame loop for the collision module.
 *
 * Same contract as `useSimulation`: a fixed-timestep accumulator drives a
 * UI-free simulator held in a ref, and a small snapshot is published to React
 * once per frame. Impact effects reuse `lib/effects/impact` so a collision
 * feels like a landing does in the drop module.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FIXED_DT } from '../lib/physics/constants';
import {
  CollisionSimulator,
  type CollisionEvent,
  type CollisionParams,
  type CollisionOutcome,
} from '../lib/physics/collision';
import {
  impactProfile,
  spawnBurst,
  stepParticles,
  type ImpactProfile,
  type Particle,
} from '../lib/effects/impact';

export type CollisionPhase = 'idle' | 'running' | 'settling' | 'done';

export interface CollisionFrame {
  t: number;
  aPosition: number;
  aVelocity: number;
  bPosition: number;
  bVelocity: number;
  trailA: number[];
  trailB: number[];
  stuck: boolean;
  particles: Particle[];
  /** Seconds since contact; -1 before it happens. */
  impactAge: number;
  profile: ImpactProfile | null;
  tick: number;
}

const SETTLE_TIME = 1.4;

function emptyFrame(params: CollisionParams): CollisionFrame {
  return {
    t: 0,
    aPosition: params.a.position,
    aVelocity: params.a.velocity,
    bPosition: params.b.position,
    bVelocity: params.b.velocity,
    trailA: [],
    trailB: [],
    stuck: false,
    particles: [],
    impactAge: -1,
    profile: null,
    tick: 0,
  };
}

/**
 * How hard the collision was.
 *
 * Uses the kinetic energy in the centre-of-mass frame, 0.5 * mu * v_rel^2 with
 * the reduced mass mu = m1*m2/(m1+m2). That is precisely the energy available
 * to the collision, and it is the same whether the objects bounce or stick —
 * so a bouncy hit and a sticky hit of equal violence shake the screen equally,
 * even though only one of them actually dissipates that energy.
 */
export function collisionSeverity(
  m1: number,
  m2: number,
  approachSpeed: number
): { energy: number; speed: number; mass: number } {
  const reduced = (m1 * m2) / Math.max(m1 + m2, 1e-9);
  const speed = Math.abs(approachSpeed);
  return { energy: 0.5 * reduced * speed * speed, speed, mass: m1 + m2 };
}

export interface UseCollisionSimOptions {
  params: CollisionParams;
  speedMultiplier: number;
  onImpact?: (event: CollisionEvent, profile: ImpactProfile) => void;
}

export function useCollisionSim({
  params,
  speedMultiplier,
  onImpact,
}: UseCollisionSimOptions) {
  const [phase, setPhase] = useState<CollisionPhase>('idle');
  const [frame, setFrame] = useState<CollisionFrame>(() => emptyFrame(params));
  const [event, setEvent] = useState<CollisionEvent | null>(null);
  const [outcome, setOutcome] = useState<CollisionOutcome | null>(null);

  const simRef = useRef<CollisionSimulator | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const impactAtRef = useRef(-1);
  const profileRef = useRef<ImpactProfile | null>(null);
  const settleRef = useRef(0);

  const paramsRef = useRef(params);
  const speedRef = useRef(speedMultiplier);
  const onImpactRef = useRef(onImpact);
  paramsRef.current = params;
  speedRef.current = speedMultiplier;
  onImpactRef.current = onImpact;

  /** Track-x -> screen, registered by the canvas so debris lands on contact. */
  const projectRef = useRef<((worldX: number) => { x: number; y: number }) | null>(null);
  const groundPixelRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const publish = useCallback((sim: CollisionSimulator, impactAge: number) => {
    setFrame((prev) => ({
      t: sim.t,
      aPosition: sim.a.position,
      aVelocity: sim.a.velocity,
      bPosition: sim.b.position,
      bVelocity: sim.b.velocity,
      trailA: sim.trailA.slice(),
      trailB: sim.trailB.slice(),
      stuck: sim.stuck,
      particles: particlesRef.current,
      impactAge,
      profile: profileRef.current,
      tick: prev.tick + 1,
    }));
  }, []);

  const loop = useCallback(
    (now: number) => {
      const sim = simRef.current;
      if (!sim) return;

      const realDt = Math.min((now - (lastRef.current || now)) / 1000, 0.25);
      lastRef.current = now;

      if (!sim.finished) {
        const hadEvent = sim.event !== null;
        accRef.current += realDt * speedRef.current;
        let guard = 4000;
        while (accRef.current >= FIXED_DT && !sim.finished && guard-- > 0) {
          sim.step(FIXED_DT);
          accRef.current -= FIXED_DT;
        }

        // Fire the impact the first frame in which contact was resolved.
        if (!hadEvent && sim.event) {
          const ev = sim.event;
          const severity = collisionSeverity(sim.a.mass, sim.b.mass, ev.approachSpeed);
          const profile = impactProfile(severity.speed, severity.mass, severity.energy);
          profileRef.current = profile;
          impactAtRef.current = 0;
          setEvent(ev);
          onImpactRef.current?.(ev, profile);
          const project = projectRef.current;
          if (project) {
            const at = project(ev.position);
            groundPixelRef.current = at.y;
            particlesRef.current = spawnBurst(at.x, at.y, profile, 0);
          }
        }

        if (sim.finished) {
          setOutcome(sim.outcome);
          setPhase('settling');
          settleRef.current = 0;
        }
      } else {
        settleRef.current += realDt;
        particlesRef.current = stepParticles(particlesRef.current, realDt, groundPixelRef.current);
        if (settleRef.current >= SETTLE_TIME && particlesRef.current.length === 0) {
          if (impactAtRef.current >= 0) impactAtRef.current += realDt;
          publish(sim, impactAtRef.current);
          setPhase('done');
          rafRef.current = null;
          return;
        }
      }

      if (impactAtRef.current >= 0) impactAtRef.current += realDt;
      publish(sim, impactAtRef.current);
      rafRef.current = requestAnimationFrame(loop);
    },
    [publish]
  );

  const start = useCallback(() => {
    stop();
    const sim = new CollisionSimulator(paramsRef.current);
    simRef.current = sim;
    particlesRef.current = [];
    profileRef.current = null;
    impactAtRef.current = -1;
    settleRef.current = 0;
    accRef.current = 0;
    lastRef.current = 0;
    setEvent(null);
    setOutcome(null);

    if (sim.finished) {
      // Nothing is moving, so there is nothing to animate.
      setOutcome(sim.outcome);
      setPhase('done');
      publish(sim, -1);
      return;
    }

    setPhase('running');
    publish(sim, -1);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop, publish, stop]);

  const reset = useCallback(() => {
    stop();
    simRef.current = null;
    particlesRef.current = [];
    profileRef.current = null;
    impactAtRef.current = -1;
    accRef.current = 0;
    setEvent(null);
    setOutcome(null);
    setFrame(emptyFrame(paramsRef.current));
    setPhase('idle');
  }, [stop]);

  useEffect(() => stop, [stop]);

  const setProjector = useCallback((fn: ((worldX: number) => { x: number; y: number }) | null) => {
    projectRef.current = fn;
  }, []);

  return { phase, frame, event, outcome, start, reset, setProjector };
}
