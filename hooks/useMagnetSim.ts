/**
 * Live state for the Magnets & Magnetism module.
 *
 * Like `useCircuitSim`, the force readout itself needs no animation loop —
 * `computeForce` is exact for the current inputs and is read straight off
 * the raw values every render, so the numbers never lag. What this hook adds
 * is purely for the visuals:
 *
 *   - "display" values (distance, both strengths, and how far through the
 *     attract/repel flip the scene is) that ease toward the real inputs
 *     over a fraction of a second, so field lines and iron filings glide
 *     rather than jump — the spec's "smooth transition" requirement;
 *   - a one-shot "snap" pulse the instant two attracting magnets are pulled
 *     within `SNAP_DISTANCE`, for the click sound/haptic/flourish.
 *
 * The animation clock only runs while something is actually easing or
 * pulsing, exactly like the circuit module's flicker clock.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ring } from '../lib/effects/impact';
import {
  computeForce,
  SNAP_DISTANCE,
  type ForceResult,
  type MagnetsInput,
  type Orientation,
} from '../lib/physics/magnetism';

/** Seconds for a display value to close most of the gap to its target. */
const EASE_TIME_CONSTANT = 0.22;
const EPSILON = 1e-3;
const SNAP_PULSE_DURATION = 0.6;

export interface UseMagnetSimInput {
  distance: number;
  strengthA: number;
  strengthB: number;
  orientation: Orientation;
}

export interface DisplayState {
  distance: number;
  strengthA: number;
  strengthB: number;
  /** 0 = fully repel configuration, 1 = fully attract configuration. */
  orientationT: number;
}

export interface UseMagnetSimOptions {
  input: UseMagnetSimInput;
  onSnap?: () => void;
}

function ease(current: number, target: number, dt: number): number {
  if (Math.abs(target - current) < EPSILON) return target;
  const k = 1 - Math.exp(-dt / EASE_TIME_CONSTANT);
  return current + (target - current) * k;
}

export function useMagnetSim({ input, onSnap }: UseMagnetSimOptions) {
  const [display, setDisplay] = useState<DisplayState>(() => ({
    distance: input.distance,
    strengthA: input.strengthA,
    strengthB: input.strengthB,
    orientationT: input.orientation === 'attract' ? 1 : 0,
  }));
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const inputRef = useRef(input);
  inputRef.current = input;
  const onSnapRef = useRef(onSnap);
  onSnapRef.current = onSnap;
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;

  const force: ForceResult = useMemo(() => computeForce(input as MagnetsInput), [
    input.distance,
    input.strengthA,
    input.strengthB,
    input.orientation,
  ]);

  // Edge-triggered: fires once on the way into the snap zone, resets once
  // the reader backs out of it (by distance, or by switching to repel).
  const inZoneRef = useRef(false);
  useEffect(() => {
    const inZone = input.orientation === 'attract' && input.distance <= SNAP_DISTANCE;
    if (inZone && !inZoneRef.current) {
      setSnapAt(elapsedRef.current);
      onSnapRef.current?.();
    }
    inZoneRef.current = inZone;
  }, [input.orientation, input.distance]);

  const orientationTarget = input.orientation === 'attract' ? 1 : 0;
  const settled =
    Math.abs(display.distance - input.distance) < EPSILON &&
    Math.abs(display.strengthA - input.strengthA) < EPSILON &&
    Math.abs(display.strengthB - input.strengthB) < EPSILON &&
    Math.abs(display.orientationT - orientationTarget) < EPSILON;
  const snapping = snapAt != null && elapsed - snapAt < SNAP_PULSE_DURATION;
  const running = !settled || snapping;

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  useEffect(() => {
    if (!running) return;
    lastRef.current = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - (lastRef.current || now)) / 1000, 0.1);
      lastRef.current = now;
      setElapsed((e) => e + dt);
      setDisplay((prev) => ({
        distance: ease(prev.distance, inputRef.current.distance, dt),
        strengthA: ease(prev.strengthA, inputRef.current.strengthA, dt),
        strengthB: ease(prev.strengthB, inputRef.current.strengthB, dt),
        orientationT: ease(
          prev.orientationT,
          inputRef.current.orientation === 'attract' ? 1 : 0,
          dt
        ),
      }));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running]);

  const snapPulse = useMemo(() => {
    if (snapAt == null) return 0;
    const age = elapsed - snapAt;
    if (age < 0 || age >= SNAP_PULSE_DURATION) return 0;
    return Math.max(0, ring(age, 0.14, 6));
  }, [snapAt, elapsed]);

  const reset = useCallback(() => setSnapAt(null), []);

  return { force, display, snapPulse, reset };
}
