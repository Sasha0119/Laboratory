/**
 * Drives the simulation from a requestAnimationFrame loop.
 *
 * The loop is a fixed-timestep accumulator: real elapsed time is banked and
 * then spent in exact FIXED_DT chunks. That decouples the physics from the
 * display refresh rate entirely — a 120 Hz iPad and a stuttering 40 fps
 * Android emulator integrate exactly the same trajectory, and slow motion is
 * just a smaller multiplier on the banked time rather than a different dt.
 *
 * React state is updated once per frame with a small snapshot object; the
 * Simulator itself lives in a ref so the 240 Hz stepping never triggers a
 * render on its own.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FIXED_DT, MAX_SIM_TIME } from '../lib/physics/constants';
import { Simulator, type SimParams, type SimResult } from '../lib/physics/simulation';
import {
  impactProfile,
  spawnBurst,
  stepParticles,
  type ImpactProfile,
  type Particle,
} from '../lib/effects/impact';

export type Phase = 'idle' | 'running' | 'settling' | 'done';

export interface Frame {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  /** World-space points visited so far, thinned for drawing. */
  path: { x: number; y: number }[];
  particles: Particle[];
  /** Seconds since the object touched down; -1 before impact. */
  impactAge: number;
  profile: ImpactProfile | null;
  /** Bumps every frame so React re-renders even when values repeat. */
  tick: number;
}

const EMPTY_FRAME: Frame = {
  t: 0,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  speed: 0,
  path: [],
  particles: [],
  impactAge: -1,
  profile: null,
  tick: 0,
};

/** Trail points kept for drawing. Older points are dropped, not averaged. */
const MAX_TRAIL = 110;

/** How long the impact effects keep animating after the object lands. */
const SETTLE_TIME = 1.5;

export interface UseSimulationOptions {
  params: SimParams;
  /** 1 = real time. Smaller is slow motion, larger fast-forwards. */
  speedMultiplier: number;
  onImpact?: (result: SimResult, profile: ImpactProfile) => void;
}

export function useSimulation({ params, speedMultiplier, onImpact }: UseSimulationOptions) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [frame, setFrame] = useState<Frame>(EMPTY_FRAME);
  const [result, setResult] = useState<SimResult | null>(null);

  const simRef = useRef<Simulator | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const accRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const impactAtRef = useRef(-1);
  const profileRef = useRef<ImpactProfile | null>(null);
  const settleRef = useRef(0);
  const paramsRef = useRef(params);
  const speedRef = useRef(speedMultiplier);
  const onImpactRef = useRef(onImpact);
  /**
   * World -> screen projection, handed over by the canvas once it knows its
   * size. Debris is simulated in screen space, so the burst needs to be
   * spawned at the pixel the object actually touched down on.
   */
  const projectRef = useRef<((x: number, y: number) => { x: number; y: number }) | null>(null);
  const groundPixelRef = useRef(0);

  paramsRef.current = params;
  speedRef.current = speedMultiplier;
  onImpactRef.current = onImpact;

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const publish = useCallback((sim: Simulator, impactAge: number) => {
    const path = sim.path;
    const trimmed =
      path.length > MAX_TRAIL ? path.slice(path.length - MAX_TRAIL) : path.slice();
    setFrame((prev) => ({
      t: sim.t,
      x: sim.state.x,
      y: sim.state.y,
      vx: sim.state.vx,
      vy: sim.state.vy,
      speed: sim.speed,
      path: trimmed,
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

      const last = lastTimeRef.current || now;
      // Clamp the real delta so a backgrounded tab does not fast-forward the
      // whole flight in a single frame.
      const realDt = Math.min((now - last) / 1000, 0.25);
      lastTimeRef.current = now;

      if (!sim.finished) {
        accRef.current += realDt * speedRef.current;
        let guard = 4000; // ceiling on catch-up work per frame
        while (accRef.current >= FIXED_DT && !sim.finished && guard-- > 0) {
          sim.step(FIXED_DT);
          accRef.current -= FIXED_DT;
        }

        if (sim.finished) {
          const res = sim.result();
          const profile = impactProfile(
            res.impactSpeed,
            paramsRef.current.mass,
            res.impactEnergy
          );
          // A soft landing (a feather, or a zero-G drift) gets no dust.
          profileRef.current = res.outcome === 'landed' ? profile : null;
          impactAtRef.current = 0;
          settleRef.current = 0;
          setResult(res);
          setPhase('settling');
          if (res.outcome === 'landed') {
            onImpactRef.current?.(res, profile);
            const project = projectRef.current;
            if (project) {
              const anchor = project(sim.state.x, 0);
              groundPixelRef.current = anchor.y;
              particlesRef.current = spawnBurst(anchor.x, anchor.y, profile, sim.state.vx);
            }
          }
        }
      } else {
        // Post-impact: only the decorative effects are still advancing.
        impactAtRef.current += realDt;
        settleRef.current += realDt;
        particlesRef.current = stepParticles(
          particlesRef.current,
          realDt,
          groundPixelRef.current
        );
        if (settleRef.current >= SETTLE_TIME && particlesRef.current.length === 0) {
          publish(sim, impactAtRef.current);
          setPhase('done');
          rafRef.current = null;
          return;
        }
      }

      publish(sim, impactAtRef.current);
      rafRef.current = requestAnimationFrame(loop);
    },
    [publish]
  );

  const start = useCallback(() => {
    stop();
    const p = paramsRef.current;
    const sim = new Simulator(p, 1 / 60);
    simRef.current = sim;
    particlesRef.current = [];
    profileRef.current = null;
    impactAtRef.current = -1;
    settleRef.current = 0;
    accRef.current = 0;
    lastTimeRef.current = 0;
    setResult(null);

    if (sim.finished) {
      // Zero-G with no push: there is nothing to animate, so report immediately.
      setResult(sim.result());
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
    setResult(null);
    setFrame({ ...EMPTY_FRAME });
    setPhase('idle');
  }, [stop]);

  useEffect(() => stop, [stop]);

  /**
   * The canvas registers its world -> screen mapping here so the impact burst
   * can be placed at the exact pixel of contact.
   */
  const setProjector = useCallback(
    (fn: ((x: number, y: number) => { x: number; y: number }) | null) => {
      projectRef.current = fn;
    },
    []
  );

  return {
    phase,
    frame,
    result,
    start,
    reset,
    setProjector,
    maxSimTime: MAX_SIM_TIME,
  };
}
