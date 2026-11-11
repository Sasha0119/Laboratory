import { useEffect, useRef } from 'react';

import type { BoundaryResult } from '../../lib/physics/light';
import { colors } from '../../theme';

export interface LightSceneLabels {
  /** "Air · n = 1.00" — top region. */
  mediumA: string;
  /** "Water · n = 1.33" — bottom region. */
  mediumB: string;
  /** Text on each ray, so they are never told apart by colour alone. */
  incoming: string;
  reflected: string;
  bent: string;
  normal: string;
  /** Angle captions, e.g. "45.0°" or "θ₁ = 45.0°". */
  incidentAngle: string;
  reflectedAngle: string;
  /** Null under total internal reflection. */
  refractedAngle: string | null;
  /** Caption for the critical-angle marker, or null to hide it. */
  critical: string | null;
  /** Shown across the lower material under total internal reflection. */
  tirBanner: string | null;
  /** Spoken description of the whole picture, for screen readers. */
  description: string;
}

interface Props {
  width: number;
  height: number;
  result: BoundaryResult;
  labels: LightSceneLabels;
}

/**
 * Ray colours from the Okabe–Ito palette, chosen to stay distinct with the
 * common forms of colour blindness. Colour is never the only cue: each ray
 * also has its own line style and a text label.
 */
export const RAY_COLORS = {
  incoming: '#F0E442', // yellow — solid line
  reflected: '#56B4E9', // sky blue — long dashes
  bent: '#E69F00', // orange — dash-dot
  critical: '#CC79A7', // reddish purple — fine dots
} as const;

const DASH = {
  incoming: [] as number[],
  reflected: [10, 6],
  bent: [16, 5, 3, 5],
  critical: [2, 4],
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Pulse speed in a vacuum-like material (n = 1), px per second. */
const PULSE_SPEED = 120;
/** Pulse spacing at n = 1, px. Both shrink by n, so the pulse rate is equal on both sides. */
const PULSE_GAP = 46;
const DEG = Math.PI / 180;

interface Pt {
  x: number;
  y: number;
}

/**
 * The boundary between two materials, the normal, and the three rays.
 *
 * Geometry is exact: every ray leaves the point of incidence at its true
 * angle from the normal, so the picture can be checked with a protractor.
 * Light pulses run along the rays at a speed proportional to 1/n and with a
 * spacing proportional to 1/n — slower and closer together in the denser
 * material, as the speed and wavelength really change — while their rate
 * stays the same on both sides, just as the frequency does.
 */
export function LightScene({ width, height, result, labels }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ result, labels });
  live.current = { result, labels };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const stillness = window.matchMedia('(prefers-reduced-motion: reduce)');
    let elapsed = 0;
    let last = 0;
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 0.1);
      last = now;
      if (!stillness.matches) elapsed += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, width, height, live.current.result, live.current.labels, elapsed);
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

/** Distance from `p` along unit vector `d` to the edge of the canvas, less a margin. */
function toEdge(p: Pt, d: Pt, w: number, h: number, margin = 6): number {
  const tx = d.x > 0 ? (w - margin - p.x) / d.x : d.x < 0 ? (margin - p.x) / d.x : Infinity;
  const ty = d.y > 0 ? (h - margin - p.y) / d.y : d.y < 0 ? (margin - p.y) / d.y : Infinity;
  return Math.max(0, Math.min(tx, ty));
}

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: BoundaryResult,
  labels: LightSceneLabels,
  t: number
) {
  ctx.clearRect(0, 0, w, h);
  const P: Pt = { x: w / 2, y: h / 2 };

  // --- the two materials: denser looks deeper -------------------------------
  ctx.fillStyle = tint(r.n1);
  ctx.fillRect(0, 0, w, P.y);
  ctx.fillStyle = tint(r.n2);
  ctx.fillRect(0, P.y, w, h - P.y);

  ctx.strokeStyle = colors.textMuted;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, P.y);
  ctx.lineTo(w, P.y);
  ctx.stroke();

  // --- the normal ------------------------------------------------------------
  ctx.save();
  ctx.strokeStyle = colors.textFaint;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(P.x, 4);
  ctx.lineTo(P.x, h - 4);
  ctx.stroke();
  ctx.restore();
  smallText(ctx, labels.normal, P.x + 6, 14, colors.textMuted, 'left');

  // --- rays ------------------------------------------------------------------
  const t1 = r.incident * DEG;
  const toSource: Pt = { x: -Math.sin(t1), y: -Math.cos(t1) };
  const reflDir: Pt = { x: Math.sin(t1), y: -Math.cos(t1) };
  const bentDir: Pt | null =
    r.refracted === null ? null : { x: Math.sin(r.refracted * DEG), y: Math.cos(r.refracted * DEG) };

  const lenIn = toEdge(P, toSource, w, h, 10);
  const lenRefl = toEdge(P, reflDir, w, h, 10);
  const lenBent = bentDir ? toEdge(P, bentDir, w, h, 10) : 0;
  const source: Pt = { x: P.x + toSource.x * lenIn, y: P.y + toSource.y * lenIn };

  // Critical-angle marker, behind the rays.
  if (labels.critical && r.critical !== null) {
    const c = r.critical * DEG;
    const dir = { x: -Math.sin(c), y: -Math.cos(c) };
    const len = Math.min(toEdge(P, dir, w, h, 10), Math.min(w, h) * 0.42);
    ray(ctx, P, dir, len, RAY_COLORS.critical, 1.5, DASH.critical, 0.9);
    const end = { x: P.x + dir.x * (len + 4), y: P.y + dir.y * (len + 4) };
    tag(ctx, labels.critical, end.x, end.y - 8, RAY_COLORS.critical, w, h, 'center');
  }

  // Reflected light is an illustration of direction, not of brightness: full
  // strength when it is all the light there is (TIR), fainter otherwise.
  ray(ctx, P, reflDir, lenRefl, RAY_COLORS.reflected, r.tir ? 3 : 2.25, DASH.reflected, r.tir ? 1 : 0.7);
  if (bentDir) ray(ctx, P, bentDir, lenBent, RAY_COLORS.bent, 3, DASH.bent, 1);
  ray(ctx, source, { x: -toSource.x, y: -toSource.y }, lenIn, RAY_COLORS.incoming, 3, DASH.incoming, 1);
  arrowHead(ctx, source, P, RAY_COLORS.incoming);

  // The light source: a small lamp at the start of the incoming ray.
  ctx.fillStyle = RAY_COLORS.incoming;
  ctx.beginPath();
  ctx.arc(source.x, source.y, 5, 0, Math.PI * 2);
  ctx.fill();

  // --- pulses ----------------------------------------------------------------
  const v1 = PULSE_SPEED / r.n1;
  const v2 = PULSE_SPEED / r.n2;
  const gap1 = PULSE_GAP / r.n1;
  const gap2 = PULSE_GAP / r.n2;
  pulses(ctx, source, { x: -toSource.x, y: -toSource.y }, lenIn, (t * v1) % gap1, gap1, RAY_COLORS.incoming, 1);
  pulses(ctx, P, reflDir, lenRefl, (t * v1) % gap1, gap1, RAY_COLORS.reflected, r.tir ? 1 : 0.55);
  if (bentDir) pulses(ctx, P, bentDir, lenBent, (t * v2) % gap2, gap2, RAY_COLORS.bent, 1);

  // --- angle arcs, measured from the normal ------------------------------------
  const R = Math.max(30, Math.min(64, Math.min(w, h) * 0.16));
  const up = -Math.PI / 2;
  const down = Math.PI / 2;
  arc(ctx, P, R, up - t1, up, RAY_COLORS.incoming);
  arc(ctx, P, R * 0.78, up, up + t1, RAY_COLORS.reflected);
  angleLabel(ctx, P, R + 16, up - t1 / 2, 'left', labels.incidentAngle, RAY_COLORS.incoming, w, h);
  angleLabel(ctx, P, R + 16, up + t1 / 2, 'right', labels.reflectedAngle, RAY_COLORS.reflected, w, h);
  if (r.refracted !== null && labels.refractedAngle) {
    const t2 = r.refracted * DEG;
    arc(ctx, P, R, down - t2, down, RAY_COLORS.bent);
    angleLabel(ctx, P, R + 16, down - t2 / 2, 'right', labels.refractedAngle, RAY_COLORS.bent, w, h);
  }

  // --- ray names, near the far end of each ray ----------------------------------
  rayName(ctx, source, P, 0.25, labels.incoming, RAY_COLORS.incoming, w, h);
  rayName(ctx, P, { x: P.x + reflDir.x * lenRefl, y: P.y + reflDir.y * lenRefl }, 0.78, labels.reflected, RAY_COLORS.reflected, w, h);
  if (bentDir) {
    rayName(ctx, P, { x: P.x + bentDir.x * lenBent, y: P.y + bentDir.y * lenBent }, 0.78, labels.bent, RAY_COLORS.bent, w, h);
  }

  // --- the two materials, named ------------------------------------------------
  // Just above and below the surface on the left: the bent and reflected
  // rays always leave to the right, and the incoming ray only passes this
  // low at grazing angles.
  tag(ctx, labels.mediumA, 8, P.y - 15, colors.text, w, h, 'left');
  tag(ctx, labels.mediumB, 8, P.y + 15, colors.text, w, h, 'left');

  if (r.tir && labels.tirBanner) {
    tag(ctx, labels.tirBanner, w / 2, P.y + (h - P.y) * 0.45, colors.text, w, h, 'center', 13);
  }
}

/** Material tint: a deeper blue for a higher refractive index. */
function tint(n: number): string {
  const alpha = 0.04 + 0.11 * (n - 1);
  return `rgba(90, 162, 255, ${alpha.toFixed(3)})`;
}

function ray(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  dir: Pt,
  length: number,
  color: string,
  width: number,
  dash: number[],
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(from.x + dir.x * length, from.y + dir.y * length);
  ctx.stroke();
  ctx.restore();
}

/** An arrowhead half way along a→b, pointing toward b. */
function arrowHead(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 30) return;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const mx = a.x + ux * len * 0.5;
  const my = a.y + uy * len * 0.5;
  const s = 7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(mx + ux * s, my + uy * s);
  ctx.lineTo(mx - ux * s - uy * s * 0.8, my - uy * s + ux * s * 0.8);
  ctx.lineTo(mx - ux * s + uy * s * 0.8, my - uy * s - ux * s * 0.8);
  ctx.closePath();
  ctx.fill();
}

/** Glowing dots spaced `gap` apart along a ray, offset by `phase`. */
function pulses(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  dir: Pt,
  length: number,
  phase: number,
  gap: number,
  color: string,
  alpha: number
) {
  if (length <= 0 || gap <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  for (let d = phase; d <= length; d += gap) {
    ctx.beginPath();
    ctx.arc(from.x + dir.x * d, from.y + dir.y * d, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function arc(ctx: CanvasRenderingContext2D, p: Pt, radius: number, a0: number, a1: number, color: string) {
  if (Math.abs(a1 - a0) < 0.002) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.75;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, Math.min(a0, a1), Math.max(a0, a1));
  ctx.stroke();
  ctx.restore();
}

/**
 * An angle value beside its arc. Kept clear of the normal on its own side,
 * so even a tiny angle's label never sits on top of the dashed line.
 */
function angleLabel(
  ctx: CanvasRenderingContext2D,
  p: Pt,
  radius: number,
  angle: number,
  side: 'left' | 'right',
  text: string,
  color: string,
  w: number,
  h: number
) {
  ctx.font = `700 11.5px ${FONT}`;
  const half = ctx.measureText(text).width / 2 + 4;
  let x = p.x + Math.cos(angle) * radius;
  const y = p.y + Math.sin(angle) * radius;
  x = side === 'left' ? Math.min(x, p.x - half - 4) : Math.max(x, p.x + half + 4);
  tag(ctx, text, x, y, color, w, h, 'center', 11.5);
}

/** A ray's name, placed `at` of the way from a to b and nudged off the line. */
function rayName(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  at: number,
  text: string,
  color: string,
  w: number,
  h: number
) {
  const x = a.x + (b.x - a.x) * at;
  const y = a.y + (b.y - a.y) * at;
  // Lift the label above the ray in the top half, below it in the bottom half.
  const offset = y < h / 2 ? -12 : 12;
  tag(ctx, text, x, y + offset, color, w, h, 'center');
}

function smallText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign) {
  ctx.font = `600 10.5px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Text on a dark backing, kept inside the canvas. */
function tag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  w: number,
  h: number,
  align: 'left' | 'center',
  size = 11
) {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const tw = ctx.measureText(text).width;
  const boxW = tw + 10;
  const boxH = size + 7;
  let left = align === 'center' ? x - boxW / 2 : x;
  left = Math.max(4, Math.min(left, w - boxW - 4));
  const top = Math.max(4, Math.min(y - boxH / 2, h - boxH - 4));
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = colors.bgElevated + 'e0';
  ctx.fillRect(left, top, boxW, boxH);
  ctx.fillStyle = color;
  ctx.fillText(text, left + 5, top + boxH / 2);
  ctx.restore();
}
