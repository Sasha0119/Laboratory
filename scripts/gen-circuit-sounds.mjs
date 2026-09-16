/**
 * One-off generator for the two circuit sound effects. Run with:
 *   node scripts/gen-circuit-sounds.mjs
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
// A soft electrical buzz: 110 Hz fundamental plus a faint 3rd harmonic and a
// little filtered noise. Duration is chosen so the fundamental completes an
// exact whole number of cycles, which makes the loop seamless with no click.
{
  const freq = 110;
  const duration = 0.5; // 55 exact cycles at 110 Hz
  const n = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(n);
  let noiseState = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const fundamental = Math.sin(2 * Math.PI * freq * t);
    const harmonic = 0.18 * Math.sin(2 * Math.PI * freq * 3 * t);
    // Cheap low-passed noise for texture, seeded deterministically.
    noiseState = noiseState * 0.9 + (Math.random() * 2 - 1) * 0.1;
    samples[i] = 0.5 * (fundamental + harmonic) + 0.06 * noiseState;
  }
  writeWav(join(OUT_DIR, 'circuit-hum.wav'), samples);
}

// ------------------------------------------------------------ burnout spark --
// A sharp crackle: dense random impulses over a fast exponential decay, with
// a quick descending tone underneath to read as an electrical pop rather than
// pure static.
{
  const duration = 0.4;
  const n = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const decay = Math.exp(-t * 11);
    const pop = (Math.random() * 2 - 1) * decay;
    // A handful of sharp crackle spikes on top of the noise bed.
    const spike = Math.random() < 0.02 ? (Math.random() * 2 - 1) * 1.5 : 0;
    const chirpFreq = 900 - 700 * t;
    const chirp = 0.35 * Math.sin(2 * Math.PI * chirpFreq * t) * decay;
    samples[i] = 0.75 * pop + 0.5 * spike * decay + chirp;
  }
  writeWav(join(OUT_DIR, 'circuit-spark.wav'), samples);
}
