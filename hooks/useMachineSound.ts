/**
 * Sound for the Simple Machines module, made with the Web Audio API.
 *
 *   lever    a soft wooden creak, rising a little with the speed of the swing
 *   ramp     the scrape of a box sliding on the slope
 *   pulley   the whirr of the rope, with small ticks as it runs over the wheels
 *   all      a dull thud when the load lands
 *
 * Everything is synthesised on the spot, so there are no audio files to load,
 * and all of it is kept quiet: this is the sound of a workshop, not an alarm.
 *
 * Browsers will not start audio before the visitor has done something on the
 * page, so `unlock()` is called from the Start button. The global Sound setting
 * (`lib/soundSettings`) is checked at the moment each noise would be made, so
 * muting takes effect at once.
 */

import { useCallback, useEffect, useRef } from 'react';

import type { MachineId } from '../lib/physics/machines';
import { isSoundEnabled } from '../lib/soundSettings';

const TICK_MS = 40;

type AudioContextCtor = typeof AudioContext;

interface Activity {
  kind: MachineId | null;
  /** 0..1 */
  speed: number;
}

export function useMachineSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
  const creakGain = useRef<GainNode | null>(null);
  const creakOsc = useRef<OscillatorNode | null>(null);
  const creakBand = useRef<BiquadFilterNode | null>(null);
  const scrapeGain = useRef<GainNode | null>(null);
  const scrapeBand = useRef<BiquadFilterNode | null>(null);
  const ropeGain = useRef<GainNode | null>(null);
  const activity = useRef<Activity>({ kind: null, speed: 0 });

  const ensure = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    if (typeof window === 'undefined') return null;
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;

    try {
      const ctx = new Ctor();
      ctxRef.current = ctx;

      // One second of white noise, reused by every layer.
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noiseRef.current = buffer;

      const loopingNoise = () => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.start();
        return source;
      };

      // The creak: a sawtooth through a narrow band, so it sounds like strained wood.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 120;
      const cBand = ctx.createBiquadFilter();
      cBand.type = 'bandpass';
      cBand.frequency.value = 520;
      cBand.Q.value = 5;
      const cGain = ctx.createGain();
      cGain.gain.value = 0;
      osc.connect(cBand).connect(cGain).connect(ctx.destination);
      osc.start();
      creakOsc.current = osc;
      creakBand.current = cBand;
      creakGain.current = cGain;

      // The scrape: noise through a broad band, louder the faster the box slides.
      const sBand = ctx.createBiquadFilter();
      sBand.type = 'bandpass';
      sBand.frequency.value = 1500;
      sBand.Q.value = 0.8;
      const sGain = ctx.createGain();
      sGain.gain.value = 0;
      loopingNoise().connect(sBand).connect(sGain).connect(ctx.destination);
      scrapeBand.current = sBand;
      scrapeGain.current = sGain;

      // The rope: a faint high hiss under the ticks.
      const rHigh = ctx.createBiquadFilter();
      rHigh.type = 'highpass';
      rHigh.frequency.value = 3200;
      const rGain = ctx.createGain();
      rGain.gain.value = 0;
      loopingNoise().connect(rHigh).connect(rGain).connect(ctx.destination);
      ropeGain.current = rGain;

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

  /** Tell the sound which machine is moving and how fast, 0..1. `null` is silence. */
  const setMotion = useCallback((kind: MachineId | null, speed: number) => {
    activity.current = { kind, speed: Math.min(1, Math.max(0, speed)) };
  }, []);

  const tick = useCallback((ctx: AudioContext, loudness: number) => {
    const buffer = noiseRef.current;
    if (!buffer) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2400 + Math.random() * 1800;
    hp.Q.value = 1.4;
    const gain = ctx.createGain();
    const len = 0.012 + Math.random() * 0.012;
    gain.gain.setValueAtTime((0.05 + Math.random() * 0.04) * loudness, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(hp).connect(gain).connect(ctx.destination);
    src.start(t, Math.random() * 0.8, len + 0.01);
  }, []);

  /** A dull knock when the load lands. `strength` is 0..1. */
  const thud = useCallback(
    (strength: number) => {
      const ctx = ctxRef.current;
      if (!ctx || ctx.state !== 'running' || !isSoundEnabled()) return;
      const t = ctx.currentTime;
      const level = 0.05 + 0.2 * Math.min(1, Math.max(0, strength));

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.16);
      gain.gain.setValueAtTime(level, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);

      const buffer = noiseRef.current;
      if (buffer) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 700;
        const g = ctx.createGain();
        g.gain.setValueAtTime(level * 0.8, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        src.connect(lp).connect(g).connect(ctx.destination);
        src.start(t, Math.random() * 0.8, 0.1);
      }
    },
    []
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      const ctx = ctxRef.current;
      if (!ctx || ctx.state !== 'running') return;
      const on = isSoundEnabled();
      const { kind, speed } = activity.current;
      const now = ctx.currentTime;
      const level = on ? speed : 0;

      // A creak is not steady: the pitch wanders and the loudness flutters.
      const creaking = kind === 'lever' ? level : 0;
      if (creakOsc.current && creakBand.current) {
        const base = 95 + 90 * creaking + Math.random() * 28;
        creakOsc.current.frequency.setTargetAtTime(base, now, 0.05);
        creakBand.current.frequency.setTargetAtTime(430 + 520 * creaking + Math.random() * 120, now, 0.06);
      }
      creakGain.current?.gain.setTargetAtTime(creaking * (0.012 + Math.random() * 0.018), now, 0.05);

      const scraping = kind === 'incline' ? level : 0;
      scrapeGain.current?.gain.setTargetAtTime(scraping * 0.045, now, 0.08);
      scrapeBand.current?.frequency.setTargetAtTime(1100 + 1500 * scraping, now, 0.1);

      const roping = kind === 'pulley' ? level : 0;
      ropeGain.current?.gain.setTargetAtTime(roping * 0.012, now, 0.08);

      // Ticks as the rope runs over the wheels: faster when it moves faster.
      if (on && roping > 0.02) {
        const perSecond = 7 + 34 * roping;
        if (Math.random() < perSecond * (TICK_MS / 1000)) tick(ctx, 0.5 + 0.5 * roping);
      }
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
      const ctx = ctxRef.current;
      ctxRef.current = null;
      noiseRef.current = null;
      creakGain.current = null;
      creakOsc.current = null;
      creakBand.current = null;
      scrapeGain.current = null;
      scrapeBand.current = null;
      ropeGain.current = null;
      ctx?.close().catch(() => {});
    };
  }, [tick]);

  return { unlock, setMotion, thud };
}
