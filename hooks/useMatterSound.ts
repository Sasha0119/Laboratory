/**
 * Sound for the States of Matter & Heat module, made with the Web Audio API.
 *
 *   boiling   a soft simmer underneath, with bubbles popping at random
 *   freezing  small dry crackles, like ice taking up a drink
 *
 * Both are synthesised on the spot, so there are no audio files to load. Each
 * pop and crackle is a few milliseconds long and scheduled at random from a
 * single timer, so the sound has no repeating pattern to give it away.
 *
 * Browsers will not start audio before the visitor has done something on the
 * page. `unlock()` is called from the Start button for exactly that reason.
 * The global Sound setting (`lib/soundSettings`) is checked at the moment each
 * noise would be made, so muting takes effect immediately.
 */

import { useCallback, useEffect, useRef } from 'react';

import { isSoundEnabled } from '../lib/soundSettings';

const TICK_MS = 60;

interface Levels {
  boil: number;
  freeze: number;
}

type AudioContextCtor = typeof AudioContext;

export function useMatterSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
  const simmerRef = useRef<GainNode | null>(null);
  const levels = useRef<Levels>({ boil: 0, freeze: 0 });

  const ensure = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    if (typeof window === 'undefined') return null;
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;

    try {
      const ctx = new Ctor();
      ctxRef.current = ctx;

      // One second of white noise, reused by the simmer and every crackle.
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noiseRef.current = buffer;

      // The simmer: looping noise, band-passed to a low rumble, silent until needed.
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 620;
      band.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(band).connect(gain).connect(ctx.destination);
      source.start();
      simmerRef.current = gain;
      return ctx;
    } catch {
      return null;
    }
  }, []);

  /** Call from a click or key press; browsers refuse to start audio any earlier. */
  const unlock = useCallback(() => {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }, [ensure]);

  /** Tell the sound what is happening: 0..1 for how much boiling and freezing there is. */
  const setActivity = useCallback((boil: number, freeze: number) => {
    levels.current = { boil, freeze };
  }, []);

  const bubble = useCallback((ctx: AudioContext, loudness: number) => {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const f0 = 240 + Math.random() * 560;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    // A bubble's pitch climbs as it collapses.
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.9, t + 0.07);
    const peak = (0.03 + Math.random() * 0.05) * loudness;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06 + Math.random() * 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }, []);

  const crackle = useCallback((ctx: AudioContext, loudness: number) => {
    const buffer = noiseRef.current;
    if (!buffer) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200 + Math.random() * 2500;
    const gain = ctx.createGain();
    const len = 0.008 + Math.random() * 0.022;
    gain.gain.setValueAtTime((0.05 + Math.random() * 0.08) * loudness, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(hp).connect(gain).connect(ctx.destination);
    src.start(t, Math.random() * 0.8, len + 0.01);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const ctx = ctxRef.current;
      if (!ctx || ctx.state !== 'running') return;
      const on = isSoundEnabled();
      const { boil, freeze } = levels.current;

      simmerRef.current?.gain.setTargetAtTime(on ? boil * 0.035 : 0, ctx.currentTime, 0.25);
      if (!on) return;

      if (boil > 0 && Math.random() < boil * 0.42) bubble(ctx, boil);
      if (freeze > 0 && Math.random() < freeze * 0.34) crackle(ctx, freeze);
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
      const ctx = ctxRef.current;
      ctxRef.current = null;
      simmerRef.current = null;
      noiseRef.current = null;
      ctx?.close().catch(() => {});
    };
  }, [bubble, crackle]);

  return { unlock, setActivity };
}
