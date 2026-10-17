/**
 * Live state for the Simple Machines module.
 *
 * The physics is in `lib/physics/machines` (the forces) and
 * `lib/machines/motion` (how the load moves). This hook is the clock: while the
 * user is pushing it advances every lane by the frame time and hands the new
 * positions back, and when nothing is moving it does not run at all.
 *
 * A lane is one thing that moves. Every mode has one for the load; the inclined
 * plane has a second for the box lifted straight up, which is the comparison.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { LaneInput } from '../lib/machines/model';
import { START, stepMotion, type Motion, type MotionEvent } from '../lib/machines/motion';

export interface UseMachineSimOptions {
  onEvent?: (event: MotionEvent, lane: number) => void;
}

/** Longest step taken in one frame, s: a background tab must not let the load teleport. */
const MAX_DT = 0.05;

export function useMachineSim(lanes: LaneInput[], { onEvent }: UseMachineSimOptions = {}) {
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [motions, setMotions] = useState<Motion[]>(() => lanes.map(() => START));

  const motionsRef = useRef(motions);
  const lanesRef = useRef(lanes);
  lanesRef.current = lanes;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const commit = useCallback((next: Motion[]) => {
    motionsRef.current = next;
    setMotions(next);
  }, []);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, MAX_DT);
      last = now;

      const current = lanesRef.current;
      const events: { event: MotionEvent; lane: number }[] = [];
      const next = current.map((lane, i) => {
        const result = stepMotion(motionsRef.current[i] ?? START, { ...lane, running: true }, dt);
        if (result.event) events.push({ event: result.event, lane: i });
        return result.motion;
      });
      commit(next);

      // The main lane arriving ends the push; the comparison lane may be done already.
      if (events.some((e) => e.lane === 0 && e.event.type === 'top')) setRunning(false);
      for (const e of events) onEventRef.current?.(e.event, e.lane);

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, commit]);

  const start = useCallback(() => {
    // Pressing the button again once the load is up lowers it and goes again.
    if ((motionsRef.current[0]?.progress ?? 0) >= 1) {
      commit(lanesRef.current.map(() => START));
    }
    setStarted(true);
    setRunning(true);
  }, [commit]);

  const pause = useCallback(() => {
    setRunning(false);
    commit(motionsRef.current.map((m) => ({ progress: m.progress, velocity: 0 })));
  }, [commit]);

  const reset = useCallback(() => {
    setRunning(false);
    setStarted(false);
    commit(lanesRef.current.map(() => START));
  }, [commit]);

  // A machine with a different number of lanes (a mode change) starts over.
  const laneCount = lanes.length;
  useEffect(() => {
    if (motionsRef.current.length !== laneCount) reset();
  }, [laneCount, reset]);

  return { running, started, motions, start, pause, reset };
}
