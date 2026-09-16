/**
 * Live state for the Simple Circuits module.
 *
 * Unlike `useSimulation` / `useCollisionSim` this is not a time-integrated
 * physics loop — `resolveCircuit` is exact for the current inputs, so there is
 * nothing to step. What this hook adds on top of that pure function is the
 * two things that genuinely need to persist across renders:
 *
 *   - which bulbs have burned out, which sticks until the reader "replaces"
 *     them, even if they turn the voltage back down afterwards;
 *   - a running clock, used only to animate the current-flow dots and the
 *     brief flicker a bulb plays the instant it fails. The clock only ticks
 *     while there is something to animate, so an idle open circuit costs
 *     nothing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ring } from '../lib/effects/impact';
import {
  resolveCircuit,
  type BulbInput,
  type CircuitOutput,
  type WiringMode,
} from '../lib/physics/circuit';

/** How long the flicker plays before a burned-out bulb settles fully dark. */
const FLICKER_DURATION = 0.9;

export interface UseCircuitSimInput {
  voltage: number;
  switchClosed: boolean;
  bulbCount: 1 | 2;
  wiring: WiringMode;
  bulbs: BulbInput[];
}

export interface UseCircuitSimOptions {
  input: UseCircuitSimInput;
  /** Fired once, the instant a bulb is flagged as burned out. */
  onBurnout?: (bulbIndex: number) => void;
}

export function useCircuitSim({ input, onBurnout }: UseCircuitSimOptions) {
  const [burnedOut, setBurnedOut] = useState<boolean[]>([false, false]);
  const [burnoutAt, setBurnoutAt] = useState<(number | null)[]>([null, null]);
  const [elapsed, setElapsed] = useState(0);

  const onBurnoutRef = useRef(onBurnout);
  onBurnoutRef.current = onBurnout;

  const result: CircuitOutput = useMemo(
    () =>
      resolveCircuit({
        voltage: input.voltage,
        switchClosed: input.switchClosed,
        bulbCount: input.bulbCount,
        wiring: input.wiring,
        bulbs: input.bulbs,
        burnedOut,
      }),
    [input.voltage, input.switchClosed, input.bulbCount, input.wiring, input.bulbs, burnedOut]
  );

  // A bulb that has just crossed its safe power, and is not already flagged,
  // burns out for good. Reading `elapsed` here (rather than depending on it)
  // is deliberate: burnout is triggered by the circuit result, not the clock.
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  useEffect(() => {
    result.bulbs.forEach((bulb, i) => {
      if (!bulb.overloaded || burnedOut[i]) return;
      setBurnedOut((prev) => {
        if (prev[i]) return prev;
        const next = prev.slice();
        next[i] = true;
        return next;
      });
      setBurnoutAt((prev) => {
        const next = prev.slice();
        next[i] = elapsedRef.current;
        return next;
      });
      onBurnoutRef.current?.(i);
    });
  }, [result, burnedOut]);

  const flickering = burnoutAt.some((t) => t != null && elapsed - t < FLICKER_DURATION);
  const flowing = input.switchClosed && result.totalCurrent > 1e-6;
  const animating = flowing || flickering;

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  useEffect(() => {
    if (!animating) return;
    lastRef.current = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - (lastRef.current || now)) / 1000, 0.1);
      lastRef.current = now;
      setElapsed((e) => e + dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [animating]);

  /** 0..1 transient glow per bulb during its burnout flicker, decaying to nothing. */
  const flicker = useMemo(
    () =>
      burnoutAt.map((t) => {
        if (t == null) return 0;
        const age = elapsed - t;
        if (age < 0 || age >= FLICKER_DURATION) return 0;
        return Math.max(0, ring(age, 0.16, 9));
      }),
    [burnoutAt, elapsed]
  );

  const reset = useCallback(() => {
    setBurnedOut([false, false]);
    setBurnoutAt([null, null]);
  }, []);

  const anyBurnedOut = burnedOut[0] || (input.bulbCount === 2 && burnedOut[1]);

  return { result, elapsed, flicker, burnedOut, anyBurnedOut, reset };
}
