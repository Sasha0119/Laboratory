/**
 * Live state for the States of Matter & Heat module.
 *
 * The physics is `lib/physics/thermo`: the substance is a single enthalpy, and
 * each frame adds `heatRate × dt` joules to it. Nothing here integrates
 * anything, so the numbers are exact however the frames fall.
 *
 * Two kinds of consumer read the result at different rates:
 *
 *   - the particle canvas redraws every frame, so it reads `live`, a ref that
 *     is updated every frame and costs React nothing;
 *   - the readouts and the graph re-render, so they read `snapshot` and
 *     `history`, which are copied into state about fifteen times a second.
 *
 * `speed` scales simulated time against real time. It exists because a
 * kilogram of water takes minutes to boil at any sensible power, and nobody
 * wants to watch a kettle in real time.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import {
  addHeat,
  atLimit,
  enthalpyForTemperature,
  stateAt,
  type PhaseId,
  type Substance,
} from '../lib/physics/thermo';

export interface MatterSimInput {
  substance: Substance;
  /** °C */
  startTemperature: number;
  /** Watts; negative cools. */
  heatRate: number;
  /** Simulated seconds per real second. */
  speed: number;
}

export interface MatterLive {
  temperature: number;
  phase: PhaseId;
  fraction: number;
  heatRate: number;
  running: boolean;
  /** Simulated seconds since the start. */
  time: number;
  /** Net heat added since the start, J (negative if cooled). */
  energy: number;
  /** Set when heating or cooling can go no further. */
  limit: 'cold' | 'hot' | null;
  /** Counts resets, so the picture knows to start over. */
  epoch: number;
}

export interface HistoryPoint {
  /** Simulated seconds */
  x: number;
  /** °C */
  y: number;
  phase: PhaseId;
}

const SNAPSHOT_INTERVAL_MS = 66;
const BASE_SAMPLE_INTERVAL = 0.2; // simulated seconds
const MAX_HISTORY = 2400;

function initialLive(input: MatterSimInput, epoch = 0): MatterLive {
  const h = enthalpyForTemperature(input.substance, input.startTemperature);
  const st = stateAt(input.substance, h);
  return {
    temperature: st.temperature,
    phase: st.phase,
    fraction: st.fraction,
    heatRate: input.heatRate,
    running: false,
    time: 0,
    energy: 0,
    limit: atLimit(input.substance, h),
    epoch,
  };
}

export function useMatterSim(input: MatterSimInput) {
  const { substance, startTemperature, heatRate, speed } = input;

  const inputRef = useRef(input);
  inputRef.current = input;

  const live: MutableRefObject<MatterLive> = useRef(initialLive(input));
  const hRef = useRef(enthalpyForTemperature(substance, startTemperature));
  const historyRef = useRef<HistoryPoint[]>([]);
  const sampleStep = useRef(BASE_SAMPLE_INTERVAL);
  const lastSample = useRef(0);

  const [snapshot, setSnapshot] = useState<MatterLive>(() => ({ ...live.current }));
  const [history, setHistory] = useState<HistoryPoint[]>(() => [
    { x: 0, y: live.current.temperature, phase: live.current.phase },
  ]);
  const [running, setRunning] = useState(false);

  const publish = useCallback(() => {
    setSnapshot({ ...live.current });
    setHistory(historyRef.current.slice());
  }, []);

  // ------------------------------------------------------------------ reset --

  const reset = useCallback(() => {
    const cur = inputRef.current;
    hRef.current = enthalpyForTemperature(cur.substance, cur.startTemperature);
    live.current = initialLive(cur, live.current.epoch + 1);
    historyRef.current = [{ x: 0, y: live.current.temperature, phase: live.current.phase }];
    sampleStep.current = BASE_SAMPLE_INTERVAL;
    lastSample.current = 0;
    setRunning(false);
    publish();
  }, [publish]);

  // A different substance or starting temperature is a different experiment.
  useEffect(() => {
    reset();
  }, [substance, startTemperature, reset]);

  // The heat rate can change mid-run; the canvas needs to see it at once.
  useEffect(() => {
    live.current.heatRate = heatRate;
    setSnapshot((s) => ({ ...s, heatRate }));
  }, [heatRate]);

  // ------------------------------------------------------------------- loop --

  useEffect(() => {
    live.current.running = running;
    if (!running) {
      publish();
      return;
    }

    let raf = 0;
    let last = 0;
    let lastPublish = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 0.1);
      last = now;

      const cur = inputRef.current;
      const simDt = dt * cur.speed;
      const before = hRef.current;
      const after = addHeat(cur.substance, before, cur.heatRate * simDt);
      hRef.current = after;

      const st = stateAt(cur.substance, after);
      const lv = live.current;
      lv.temperature = st.temperature;
      lv.phase = st.phase;
      lv.fraction = st.fraction;
      lv.heatRate = cur.heatRate;
      lv.time += simDt;
      lv.energy += after - before;

      // Record a point now and then; thin the record if it grows too long.
      if (lv.time - lastSample.current >= sampleStep.current) {
        lastSample.current = lv.time;
        historyRef.current.push({ x: lv.time, y: st.temperature, phase: st.phase });
        if (historyRef.current.length > MAX_HISTORY) {
          historyRef.current = historyRef.current.filter((_, i, a) => i % 2 === 0 || i === a.length - 1);
          sampleStep.current *= 2;
        }
      }

      // Stop at absolute zero, or at the top of the scale, when pushing against it.
      const lim = atLimit(cur.substance, after);
      lv.limit = lim;
      const pushing = (lim === 'hot' && cur.heatRate > 0) || (lim === 'cold' && cur.heatRate < 0);
      if (pushing) {
        historyRef.current.push({ x: lv.time, y: st.temperature, phase: st.phase });
        lv.running = false;
        setRunning(false);
        publish();
        return;
      }

      if (now - lastPublish >= SNAPSHOT_INTERVAL_MS) {
        lastPublish = now;
        publish();
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, publish]);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);

  return useMemo(
    () => ({ live, snapshot, history, running, start, pause, reset, speed }),
    [snapshot, history, running, start, pause, reset, speed]
  );
}
