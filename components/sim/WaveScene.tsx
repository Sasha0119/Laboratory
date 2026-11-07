import { useEffect, useRef } from 'react';

import {
  beatEnvelope,
  beatFrequency,
  displacementAtPhase,
  niceFloor,
  superpose,
  timeScale,
  wavelength,
} from '../../lib/physics/waves';
import { friendly } from '../../lib/format';
import { colors } from '../../theme';

export interface WaveSceneLabels {
  /** Above the "one full wave" bracket. */
  oneWave: string;
  /** Beside the marker for how tall the wave is. */
  amplitude: string;
  first: string;
  second: string;
  combined: string;
  /** Beside the live meter of the combined loudness. */
  loudness: string;
  /** Spoken description of the whole picture. */
  description: string;
}

interface Props {
  width: number;
  height: number;
  /** m/s */
  speed: number;
  f1: number;
  a1: number;
  /** Null when there is no second wave. */
  second: { frequency: number; amplitude: number } | null;
  /** How many metres the view spans; see `viewWidth`. */
  span: number;
  labels: WaveSceneLabels;
}

/** Distance between samples along the line, CSS px. */
const SAMPLE_PX = 0.5;
const TOP_ROOM = 30;
const BOTTOM_ROOM = 26;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** A beat faster than this is left steady on the meter rather than flickering. */
const METER_MAX_BEAT = 12;

/**
 * The moving wave, drawn on a canvas.
 *
 * Every drawn length comes from the real wavelength and one metres-to-pixels
 * scale, and every drawn height from the amplitude and one units-to-pixels
 * scale, so the picture stays in proportion. Only time is slowed down.
 *
 * Each wave keeps its own running phase rather than computing f·t afresh, so
 * typing a new frequency does not make the wave jump.
 */
export function WaveScene({ width, height, speed, f1, a1, second, span, labels }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ speed, f1, a1, second, span, labels });
  live.current = { speed, f1, a1, second, span, labels };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const stillness = window.matchMedia('(prefers-reduced-motion: reduce)');
    let phase1 = 0;
    let phase2 = 0;
    let last = 0;
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 0.1);
      last = now;
      const l = live.current;

      // One slowdown for both waves, so they stay true to each other.
      const scale = timeScale(l.f1);
      if (!stillness.matches) {
        phase1 = (phase1 + l.f1 * scale * dt) % 1;
        phase2 = (phase2 + (l.second?.frequency ?? 0) * scale * dt) % 1;
      }
      // Two identical frequencies are shown in step, as `audioMix` plays them.
      if (l.second && l.second.frequency === l.f1) phase2 = phase1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, width, height, l, phase1, phase2, now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block' }}
      role="img"
      aria-label={labels.description}
    />
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  l: Omit<Props, 'width' | 'height'>,
  phase1: number,
  phase2: number,
  seconds: number
) {
  ctx.clearRect(0, 0, w, h);
  const metresPerPx = l.span / w;
  const lambda1 = wavelength(l.speed, l.f1);
  const lambda2 = l.second ? wavelength(l.speed, l.second.frequency) : 0;
  const usable = h - TOP_ROOM - BOTTOM_ROOM;

  const y1 = (px: number) => displacementAtPhase(px * metresPerPx, l.a1, lambda1, phase1);
  const y2 = (px: number) =>
    l.second ? displacementAtPhase(px * metresPerPx, l.second.amplitude, lambda2, phase2) : 0;

  if (!l.second) {
    // One lane, tall enough for the largest amplitude.
    const unit = usable / 2 / 100;
    const mid = TOP_ROOM + usable / 2;
    axis(ctx, w, mid);
    line(ctx, w, mid, unit, y1, colors.accent, 2.25);
    amplitudeMarker(ctx, w, mid, l.a1 * unit, l.labels.amplitude);
  } else {
    // Two lanes on one vertical scale: the waves reach ±100, their sum ±200.
    const unit = usable / 600;
    const midA = TOP_ROOM + 100 * unit;
    const midB = TOP_ROOM + 200 * unit + 200 * unit;
    axis(ctx, w, midA);
    axis(ctx, w, midB);
    line(ctx, w, midA, unit, y2, colors.violet, 1.5);
    line(ctx, w, midA, unit, y1, colors.accent, 1.5);
    line(ctx, w, midB, unit, (px) => superpose(y1(px), y2(px)), colors.amber, 2);
    amplitudeMarker(ctx, w, midA, l.a1 * unit, l.labels.amplitude);

    const laneLabelY = TOP_ROOM + 200 * unit + 4;
    const afterFirst = tag(ctx, l.labels.first, 8, laneLabelY, colors.accent);
    tag(ctx, l.labels.second, afterFirst + 4, laneLabelY, colors.violet);
    tag(ctx, l.labels.combined, 8, h - BOTTOM_ROOM - 4, colors.amber);

    loudnessMeter(ctx, w, h, l.a1, l.second.amplitude, beatFrequency(l.f1, l.second.frequency), seconds, l.labels.loudness);
  }

  bracket(ctx, lambda1 / metresPerPx, l.labels.oneWave, w);
  ruler(ctx, w, h, l.span);
}

/** A label on a dark backing, so it reads even with a wave passing behind it. Returns its right edge. */
function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): number {
  ctx.font = `700 11px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(text).width + 8;
  ctx.fillStyle = colors.bgElevated + 'e6';
  ctx.fillRect(x, y - 8, width, 16);
  ctx.fillStyle = color;
  ctx.fillText(text, x + 4, y);
  return x + width;
}

function axis(ctx: CanvasRenderingContext2D, w: number, y: number) {
  ctx.save();
  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  ctx.restore();
}

function line(
  ctx: CanvasRenderingContext2D,
  w: number,
  mid: number,
  unit: number,
  value: (px: number) => number,
  color: string,
  thickness: number
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let px = 0; px <= w; px += SAMPLE_PX) {
    const y = mid - value(px) * unit;
    if (px === 0) ctx.moveTo(px, y);
    else ctx.lineTo(px, y);
  }
  ctx.stroke();
}

/** The bracket marking off one full wave, along the top of the picture. */
function bracket(ctx: CanvasRenderingContext2D, lengthPx: number, text: string, w: number) {
  const x0 = 12;
  const x1 = x0 + lengthPx;
  const y = 22;

  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y + 6);
  ctx.lineTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.lineTo(x1, y + 6);
  ctx.stroke();

  ctx.font = `700 11px ${FONT}`;
  ctx.fillStyle = colors.text;
  ctx.textBaseline = 'alphabetic';
  const textWidth = ctx.measureText(text).width;
  const centred = x0 + lengthPx / 2 - textWidth / 2;
  ctx.textAlign = 'left';
  ctx.fillText(text, Math.min(Math.max(x0, centred), w - textWidth - 8), y - 6);
}

/** How tall the wave is, measured up from its resting line at the right-hand edge. */
function amplitudeMarker(ctx: CanvasRenderingContext2D, w: number, mid: number, heightPx: number, text: string) {
  const x = w - 16;
  ctx.strokeStyle = colors.blue;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 4, mid);
  ctx.lineTo(x + 4, mid);
  ctx.moveTo(x, mid);
  ctx.lineTo(x, mid - heightPx);
  ctx.moveTo(x - 4, mid - heightPx);
  ctx.lineTo(x + 4, mid - heightPx);
  ctx.stroke();

  ctx.font = `700 11px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const textWidth = ctx.measureText(text).width;
  const textY = mid - heightPx / 2;
  ctx.fillStyle = colors.bgElevated + 'cc';
  ctx.fillRect(x - 10 - textWidth - 3, textY - 8, textWidth + 6, 16);
  ctx.fillStyle = colors.blue;
  ctx.fillText(text, x - 10, textY);
}

/**
 * The loudness of the sum, moving at the REAL beat rate. The drawn waves are in
 * slow motion, so this is what lines the picture up with what the ear hears.
 */
function loudnessMeter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  a1: number,
  a2: number,
  fBeat: number,
  seconds: number,
  text: string
) {
  const rate = fBeat <= METER_MAX_BEAT ? fBeat : 0;
  const fill = beatEnvelope(a1, a2, rate, seconds) / 200;
  const barW = Math.min(90, w * 0.22);
  const x = w - barW - 12;
  const y = h - 13;

  ctx.fillStyle = colors.surfaceAlt;
  ctx.fillRect(x, y, barW, 6);
  ctx.fillStyle = colors.amber;
  ctx.fillRect(x, y, barW * fill, 6);

  ctx.font = `600 10.5px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colors.textMuted;
  ctx.fillText(text, w - 12, y - 4);
}

/** A bar of a round length, so the true scale can always be read off. */
function ruler(ctx: CanvasRenderingContext2D, w: number, h: number, span: number) {
  const metres = niceFloor(span / 4);
  const lengthPx = (metres / span) * w;
  const x = 12;
  const y = h - 10;

  ctx.strokeStyle = colors.textMuted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y);
  ctx.lineTo(x + lengthPx, y);
  ctx.lineTo(x + lengthPx, y - 4);
  ctx.stroke();

  ctx.font = `600 10.5px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.textMuted;
  ctx.fillText(`${friendly(metres)} m`, x + lengthPx + 6, y - 2);
}
