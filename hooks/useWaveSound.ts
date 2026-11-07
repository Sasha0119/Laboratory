/**
 * The tones for the Waves & Sound module, made with the Web Audio API.
 *
 * Two sine oscillators, each with its own gain, feed one master gain. They are
 * simply added together, so two close frequencies really do beat: nothing fakes
 * the wobble.
 *
 * Safety, in order of how much it matters:
 *   - Nothing exists until `start()` runs, and the page only calls that from a
 *     press of Play, so sound can never begin on its own.
 *   - Every gain change is a short glide, so there are no clicks or sudden bursts.
 *   - `lib/physics/waves` caps the gain of each wave.
 *   - The page calls `stop()` when the reader leaves or the tab loses focus.
 */

import { useCallback, useEffect, useRef } from 'react';

import type { AudioMix } from '../lib/physics/waves';

/** Time constant of the fade in and out, s. About 0.15 s to fade fully. */
const FADE = 0.04;
/** Time constant of a change of loudness or pitch while playing, s. */
const GLIDE = 0.03;
/** How long a fade is given to finish before the audio is put to sleep, ms. */
const SLEEP_AFTER_MS = 250;

type AudioContextCtor = typeof AudioContext;

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  osc1: OscillatorNode;
  gain1: GainNode;
  osc2: OscillatorNode;
  gain2: GainNode;
}

export function useWaveSound() {
  const graphRef = useRef<Graph | null>(null);
  const mixRef = useRef<AudioMix | null>(null);
  const sleepTimer = useRef<number | null>(null);

  const clearSleep = useCallback(() => {
    if (sleepTimer.current !== null) window.clearTimeout(sleepTimer.current);
    sleepTimer.current = null;
  }, []);

  const build = useCallback((): Graph | null => {
    if (graphRef.current) return graphRef.current;
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;

    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      const voice = () => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain).connect(master);
        osc.start();
        return { osc, gain };
      };
      const first = voice();
      const second = voice();

      graphRef.current = { ctx, master, osc1: first.osc, gain1: first.gain, osc2: second.osc, gain2: second.gain };
      return graphRef.current;
    } catch {
      return null;
    }
  }, []);

  const applyMix = useCallback((graph: Graph, mix: AudioMix, immediate: boolean) => {
    const now = graph.ctx.currentTime;
    const glide = (param: AudioParam, value: number) => {
      param.cancelScheduledValues(now);
      if (immediate) param.setValueAtTime(value, now);
      else param.setTargetAtTime(value, now, GLIDE);
    };
    glide(graph.osc1.frequency, mix.f1);
    glide(graph.osc2.frequency, mix.f2);
    glide(graph.gain1.gain, mix.g1);
    glide(graph.gain2.gain, mix.g2);
  }, []);

  /** Tell the sound what the waves are now. Safe whether or not it is playing. */
  const setMix = useCallback(
    (mix: AudioMix) => {
      mixRef.current = mix;
      if (graphRef.current) applyMix(graphRef.current, mix, false);
    },
    [applyMix]
  );

  /** Fade in. Call from a press of Play; browsers refuse to start audio any earlier. */
  const start = useCallback(() => {
    const graph = build();
    if (!graph) return;
    clearSleep();
    if (mixRef.current) applyMix(graph, mixRef.current, graph.master.gain.value === 0);
    if (graph.ctx.state === 'suspended') graph.ctx.resume().catch(() => {});

    const now = graph.ctx.currentTime;
    graph.master.gain.cancelScheduledValues(now);
    graph.master.gain.setTargetAtTime(1, now, FADE);
  }, [applyMix, build, clearSleep]);

  /** Fade out, then let the audio sleep. Harmless if nothing has played yet. */
  const stop = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.ctx.currentTime;
    graph.master.gain.cancelScheduledValues(now);
    graph.master.gain.setTargetAtTime(0, now, FADE);

    clearSleep();
    sleepTimer.current = window.setTimeout(() => {
      sleepTimer.current = null;
      if (graph.ctx.state === 'running') graph.ctx.suspend().catch(() => {});
    }, SLEEP_AFTER_MS);
  }, [clearSleep]);

  // Leaving the lesson: fade, then release the audio device altogether.
  useEffect(
    () => () => {
      clearSleep();
      const graph = graphRef.current;
      graphRef.current = null;
      if (!graph) return;
      const now = graph.ctx.currentTime;
      graph.master.gain.cancelScheduledValues(now);
      graph.master.gain.setTargetAtTime(0, now, FADE);
      window.setTimeout(() => {
        graph.ctx.close().catch(() => {});
      }, SLEEP_AFTER_MS);
    },
    [clearSleep]
  );

  return { start, stop, setMix };
}
