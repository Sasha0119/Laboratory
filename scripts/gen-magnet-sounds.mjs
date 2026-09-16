/**
 * One-off generator for the two magnetism sound effects. Run with:
 *   node scripts/gen-magnet-sounds.mjs
 *
 * Writes plain PCM16 mono WAV files directly — no audio libraries needed.
 * Not part of the app build; the output is checked in like any other asset.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
const SAMPLE_RATE = 22050;

function writeWav(path, samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buffer);
  console.log(`wrote ${path} (${(dataSize / 1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------- hum loop --
// A warm, low ambient tone — deliberately a different fundamental from the
// circuit hum so the two modules don't sound identical. 90 Hz over 0.5 s is
// 45 exact cycles, so the loop is seamless.
{
  const freq = 90;
  const duration = 0.5;
  const n = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(n);
  let noiseState = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const fundamental = Math.sin(2 * Math.PI * freq * t);
    const harmonic = 0.22 * Math.sin(2 * Math.PI * freq * 2 * t);
    noiseState = noiseState * 0.92 + (Math.random() * 2 - 1) * 0.08;
    samples[i] = 0.55 * (fundamental + harmonic) + 0.05 * noiseState;
  }
  writeWav(join(OUT_DIR, 'magnet-hum.wav'), samples);
}

// --------------------------------------------------------------- snap click --
// A solid, mechanical "thunk" rather than an electrical crackle: a short
// low-frequency thump with a fast pitch drop, plus a very brief high click
// at the very front to give it a sense of contact.
{
  const duration = 0.3;
  const n = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const thumpDecay = Math.exp(-t * 18);
    const thumpFreq = 180 - 90 * t;
    const thump = Math.sin(2 * Math.PI * thumpFreq * t) * thumpDecay;
    const clickWindow = t < 0.012 ? 1 - t / 0.012 : 0;
    const click = (Math.random() * 2 - 1) * clickWindow;
    samples[i] = 0.8 * thump + 0.6 * click;
  }
  writeWav(join(OUT_DIR, 'magnet-click.wav'), samples);
}
