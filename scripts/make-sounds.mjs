/**
 * Generates the four impact sounds in assets/sounds/ as 16-bit mono WAV.
 *
 * The app has no external asset dependencies, so the impact samples are
 * synthesised here rather than shipped as opaque binaries. Each material is
 * built from a transient (noise burst) plus a set of decaying partials, which
 * is roughly how the real thing sounds: a click at contact, then whatever the
 * body rings at.
 *
 * Pitch and loudness are varied at runtime from the impact velocity — see
 * hooks/useImpactSound.ts — so these are recorded at a neutral "reference"
 * impact and shifted from there.
 *
 * Run:  node scripts/make-sounds.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

/** Deterministic noise, so re-running the script produces identical files. */
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

const decay = (t, tau) => Math.exp(-t / tau);

/** One-pole low-pass, used to give each noise burst a different colour. */
function lowpass(buffer, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < buffer.length; i++) {
    prev += alpha * (buffer[i] - prev);
    buffer[i] = prev;
  }
}

/** One-pole high-pass, for the bright crack of glass. */
function highpass(buffer, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SAMPLE_RATE;
  const alpha = rc / (rc + dt);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < buffer.length; i++) {
    const x = buffer[i];
    prevOut = alpha * (prevOut + x - prevIn);
    prevIn = x;
    buffer[i] = prevOut;
  }
}

/**
 * @param {object} spec
 * @param {number} spec.duration     seconds
 * @param {Array}  spec.partials     [{ freq, amp, tau, detune }]
 * @param {object} [spec.noise]      { amp, tau, lowpass, highpass }
 * @param {number} [spec.gain]       final peak level, 0..1
 */
function render(spec, seed) {
  const n = Math.floor(spec.duration * SAMPLE_RATE);
  const out = new Float64Array(n);

  // Tonal body: exponentially decaying sinusoids.
  for (const p of spec.partials ?? []) {
    const phase = Math.random() * 0; // fixed phase keeps the attack coherent
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      out[i] += p.amp * decay(t, p.tau) * Math.sin(2 * Math.PI * p.freq * t + phase);
    }
  }

  // Contact transient.
  if (spec.noise) {
    const rnd = makeRandom(seed);
    const noise = new Float64Array(n);
    for (let i = 0; i < n; i++) noise[i] = rnd();
    if (spec.noise.lowpass) lowpass(noise, spec.noise.lowpass);
    if (spec.noise.highpass) highpass(noise, spec.noise.highpass);
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      out[i] += spec.noise.amp * decay(t, spec.noise.tau) * noise[i];
    }
  }

  // 1.5 ms fade in / 8 ms fade out so there is no DC click at either end.
  const fadeIn = Math.floor(SAMPLE_RATE * 0.0015);
  const fadeOut = Math.floor(SAMPLE_RATE * 0.008);
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i++) out[n - 1 - i] *= i / fadeOut;

  // Normalise to the requested peak.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = peak > 0 ? (spec.gain ?? 0.9) / peak : 0;

  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(out[i] * scale * 32767)));
  }
  return pcm;
}

function toWav(pcm) {
  const dataBytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // format = PCM
  buf.writeUInt16LE(1, 22); // channels = mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  return buf;
}

const SOUNDS = {
  // Football hitting turf: low, round, a bit of skin slap on top.
  rubber: {
    duration: 0.36,
    gain: 0.92,
    partials: [
      { freq: 96, amp: 1.0, tau: 0.085 },
      { freq: 191, amp: 0.38, tau: 0.055 },
      { freq: 288, amp: 0.14, tau: 0.03 },
      { freq: 61, amp: 0.5, tau: 0.12 },
    ],
    noise: { amp: 0.45, tau: 0.007, lowpass: 2600 },
  },
  // Glass marble on stone: almost all transient, with a bright short ring.
  glass: {
    duration: 0.26,
    gain: 0.85,
    partials: [
      { freq: 3180, amp: 0.55, tau: 0.045 },
      { freq: 4720, amp: 0.35, tau: 0.03 },
      { freq: 6240, amp: 0.2, tau: 0.018 },
      { freq: 1470, amp: 0.25, tau: 0.02 },
    ],
    noise: { amp: 0.8, tau: 0.0035, highpass: 1800 },
  },
  // Hardcover landing flat: broadband slap over a dull thump.
  paper: {
    duration: 0.4,
    gain: 0.88,
    partials: [
      { freq: 68, amp: 0.9, tau: 0.1 },
      { freq: 132, amp: 0.3, tau: 0.06 },
      { freq: 205, amp: 0.12, tau: 0.035 },
    ],
    noise: { amp: 0.7, tau: 0.025, lowpass: 4200 },
  },
  // Feather touching down: barely there, just a whisper of air.
  soft: {
    duration: 0.3,
    gain: 0.5,
    partials: [{ freq: 172, amp: 0.25, tau: 0.05 }],
    noise: { amp: 0.6, tau: 0.05, lowpass: 1400 },
  },
};

mkdirSync(OUT_DIR, { recursive: true });
let seed = 1337;
for (const [name, spec] of Object.entries(SOUNDS)) {
  const wav = toWav(render(spec, (seed += 7919)));
  const file = join(OUT_DIR, `impact-${name}.wav`);
  writeFileSync(file, wav);
  console.log(`wrote ${file} (${(wav.length / 1024).toFixed(1)} KB)`);
}
