import { useEffect, useRef, type MutableRefObject } from 'react';

import type { MatterLive } from '../../hooks/useMatterSim';
import { COLS, MatterEngine, ROWS, type EngineInput } from '../../lib/matter/engine';
import { heatColor } from '../../lib/matter/colors';
import { heatLevel, type Substance } from '../../lib/physics/thermo';

interface Props {
  width: number;
  height: number;
  /** Updated every frame by the simulation; read here, never rendered from. */
  live: MutableRefObject<MatterLive>;
  substance: Substance;
}

/**
 * The container and the particles in it, drawn on a canvas.
 *
 * A canvas rather than SVG because the picture changes every frame and has
 * nothing to do with React's state: the animation loop here reads the
 * simulation's `live` ref and the particle engine, and draws. React only sets
 * the canvas up and tears it down.
 */
export function MatterScene({ width, height, live, substance }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MatterEngine | null>(null);
  const substanceRef = useRef(substance);
  substanceRef.current = substance;

  if (!engineRef.current) engineRef.current = new MatterEngine();

  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine || width < 10 || height < 10) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const first = engine.particles[0].homeX === 0 && engine.particles[0].homeY === 0;
    engine.resize(width, height);
    if (first) {
      const l = live.current;
      engine.settle(toInput(l));
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    let epoch = live.current.epoch;
    let time = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 0.1);
      last = now;
      time += dt;

      const l = live.current;
      const sub = substanceRef.current;
      if (l.epoch !== epoch) {
        epoch = l.epoch;
        engine.settle(toInput(l));
      }
      engine.step(dt, toInput(l), sub);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, engine, l, sub, width, height, time);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, live]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block' }}
      role="img"
      aria-label="Particles in a container"
    />
  );
}

function toInput(l: MatterLive): EngineInput {
  return {
    phase: l.phase,
    fraction: l.fraction,
    temperature: l.temperature,
    heatRate: l.heatRate,
    running: l.running,
  };
}

// --------------------------------------------------------------- drawing ---

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function draw(
  ctx: CanvasRenderingContext2D,
  engine: MatterEngine,
  live: MatterLive,
  sub: Substance,
  width: number,
  height: number,
  time: number
) {
  ctx.clearRect(0, 0, width, height);
  const { left, top, right, bottom } = engine.bounds;
  const level = heatLevel(sub, live.temperature);
  const r = engine.radius;

  // ---- the heat source under the box ---------------------------------------
  const power = Math.min(1, Math.sqrt(Math.abs(live.heatRate) / 80_000));
  const active = live.running && power > 0.02;
  const heating = live.heatRate >= 0;
  const plateY = bottom + 12;
  if (active) {
    const glow = ctx.createRadialGradient((left + right) / 2, plateY, 4, (left + right) / 2, plateY, (right - left) * 0.6);
    const c = heating ? '255, 150, 70' : '120, 200, 255';
    glow.addColorStop(0, `rgba(${c}, ${0.55 * power})`);
    glow.addColorStop(1, `rgba(${c}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, plateY - 40, width, 80);
  }
  const plate = ctx.createLinearGradient(0, plateY - 5, 0, plateY + 5);
  if (active) {
    const c = heating ? '255, 170, 90' : '150, 215, 255';
    plate.addColorStop(0, `rgba(${c}, ${0.55 + 0.4 * power})`);
    plate.addColorStop(1, `rgba(${c}, 0.25)`);
  } else {
    plate.addColorStop(0, 'rgba(120, 135, 160, 0.35)');
    plate.addColorStop(1, 'rgba(70, 82, 104, 0.35)');
  }
  roundRect(ctx, left - 8, plateY - 5, right - left + 16, 10, 5);
  ctx.fillStyle = plate;
  ctx.fill();

  // ---- the glass box -------------------------------------------------------
  const pad = 6;
  const boxX = left - pad;
  const boxY = top - pad;
  const boxW = right - left + pad * 2;
  const boxH = bottom - top + pad * 2;
  const wall = ctx.createLinearGradient(0, boxY, 0, boxY + boxH);
  wall.addColorStop(0, 'rgba(255, 255, 255, 0.025)');
  wall.addColorStop(1, heatColor(level, 0.07));
  roundRect(ctx, boxX, boxY, boxW, boxH, 12);
  ctx.fillStyle = wall;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(190, 210, 240, 0.34)';
  ctx.stroke();

  ctx.save();
  roundRect(ctx, boxX, boxY, boxW, boxH, 12);
  ctx.clip();

  // ---- the liquid ----------------------------------------------------------
  const pool = engine.poolAmount;
  if (pool > 0.03) {
    const boiling = live.phase === 'boiling' ? 1 : 0;
    const agit = 1.2 + boiling * 2.4 + Math.min(2, level * 2);
    const body = ctx.createLinearGradient(0, engine.surfaceY, 0, bottom);
    body.addColorStop(0, heatColor(level, 0.26 * Math.min(1, pool * 1.8)));
    body.addColorStop(1, heatColor(level, 0.5 * Math.min(1, pool * 1.8)));
    ctx.beginPath();
    ctx.moveTo(left - pad, bottom + pad);
    ctx.lineTo(left - pad, engine.surfaceY);
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const x = left - pad + (boxW * i) / steps;
      const y = engine.surfaceY + Math.sin(x * 0.07 + time * 3.1) * agit + Math.sin(x * 0.17 - time * 2.3) * agit * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(right + pad, bottom + pad);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = left - pad + (boxW * i) / steps;
      const y = engine.surfaceY + Math.sin(x * 0.07 + time * 3.1) * agit + Math.sin(x * 0.17 - time * 2.3) * agit * 0.5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = heatColor(Math.min(1, level + 0.1), 0.55 * Math.min(1, pool * 2));
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ---- lattice bonds -------------------------------------------------------
  const ps = engine.particles;
  ctx.lineWidth = 1.4;
  for (const p of ps) {
    const pairs: number[] = [];
    if (p.col < COLS - 1) pairs.push(p.row * COLS + p.col + 1);
    if (p.row < ROWS - 1) pairs.push((p.row + 1) * COLS + p.col);
    for (const j of pairs) {
      const q = ps[j];
      const strength = Math.min(p.lock, q.lock);
      if (strength < 0.35) continue;
      ctx.strokeStyle = `rgba(190, 225, 255, ${0.5 * ((strength - 0.35) / 0.65)})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
  }

  // ---- bubbles -------------------------------------------------------------
  for (const b of engine.bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(235, 248, 255, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fill();
  }

  // ---- particles -----------------------------------------------------------
  // Slightly different shades per particle so the picture is not flat.
  for (const p of ps) {
    const shade = Math.min(1, Math.max(0, level + ((p.col * 7 + p.row * 3) % 5 - 2) * 0.012));
    const rad = r * (1 + 0.1 * p.gas);
    if (p.gas > 0.3 && level > 0.35) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * 2.1, 0, Math.PI * 2);
      ctx.fillStyle = heatColor(shade, 0.06 + 0.1 * p.gas);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(p.x - rad * 0.35, p.y - rad * 0.4, rad * 0.1, p.x, p.y, rad);
    g.addColorStop(0, heatColor(Math.min(1, shade + 0.16), 1));
    g.addColorStop(1, heatColor(Math.max(0, shade - 0.08), 0.95));
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // ---- steam ---------------------------------------------------------------
  for (const w of engine.wisps) {
    const k = w.age / w.life;
    const rad = w.r * (1 + k * 2.4);
    const alpha = 0.2 * (1 - k) * Math.min(1, k * 6);
    const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, rad);
    g.addColorStop(0, `rgba(235, 245, 255, ${alpha})`);
    g.addColorStop(1, 'rgba(235, 245, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w.x, w.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- crystals glinting as it freezes -------------------------------------
  for (const sp of engine.sparkles) {
    const k = sp.age / sp.life;
    const a = Math.sin(Math.PI * k);
    const arm = sp.size * (0.5 + 0.9 * k);
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(k * 0.9);
    ctx.strokeStyle = `rgba(215, 240, 255, ${0.9 * a})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const ang = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * -arm, Math.sin(ang) * -arm);
      ctx.lineTo(Math.cos(ang) * arm, Math.sin(ang) * arm);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();

  // ---- glass highlight over the top ----------------------------------------
  ctx.beginPath();
  ctx.moveTo(boxX + 14, boxY + 8);
  ctx.lineTo(boxX + 14, boxY + boxH * 0.4);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
}
