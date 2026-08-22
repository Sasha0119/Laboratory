import { useEffect, useMemo } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { ENVIRONMENTS, type EnvironmentId } from '../../lib/physics/constants';
import type { ObjectPreset } from '../../lib/physics/presets';
import { ring } from '../../lib/effects/impact';
import type { Frame, Phase } from '../../hooks/useSimulation';
import { scenes } from '../../theme';
import { ObjectGlyph } from './ObjectGlyph';
import {
  makeViewport,
  renderRadius,
  rulerTicks,
  toScreenX,
  toScreenY,
  type WorldBounds,
} from './viewport';

interface Props {
  width: number;
  height: number;
  environmentId: EnvironmentId;
  preset: ObjectPreset;
  bounds: WorldBounds;
  frame: Frame;
  phase: Phase;
  /** The previous run's path, drawn faintly so two runs can be compared. */
  ghostPath?: { x: number; y: number }[] | null;
  ghostLabel?: string | null;
  onProjector: (fn: ((x: number, y: number) => { x: number; y: number }) | null) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Small deterministic PRNG so scenery is stable across re-renders. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

export function Scene({
  width,
  height,
  environmentId,
  preset,
  bounds,
  frame,
  phase,
  ghostPath,
  ghostLabel,
  onProjector,
}: Props) {
  const env = ENVIRONMENTS[environmentId];
  const palette = scenes[environmentId];

  const vp = useMemo(
    () => makeViewport(width, height, bounds, env.hasGround),
    [width, height, bounds, env.hasGround]
  );

  // Hand the projection to the simulation loop so debris spawns on contact.
  useEffect(() => {
    onProjector((x, y) => ({ x: toScreenX(vp, x), y: toScreenY(vp, y) }));
    return () => onProjector(null);
  }, [vp, onProjector]);

  const r = renderRadius(vp, preset.sizeMeters);

  // ---------------------------------------------------------------- scenery
  const stars = useMemo(() => {
    if (!palette.stars) return [];
    const rnd = seeded(environmentId.length * 7919 + Math.round(width));
    return Array.from({ length: palette.stars }, () => ({
      x: rnd() * width,
      y: rnd() * (env.hasGround ? vp.groundY : height),
      r: 0.4 + rnd() * 1.3,
      o: 0.25 + rnd() * 0.75,
    }));
  }, [palette.stars, environmentId, width, height, vp.groundY, env.hasGround]);

  const grit = useMemo(() => {
    if (!env.hasGround) return [];
    const bandTop = vp.groundY;
    const bandH = Math.max(height - bandTop, 10);
    const rnd = seeded(Math.round(bandTop) * 104729 + environmentId.length);
    return Array.from({ length: 110 }, () => ({
      x: rnd() * width,
      y: bandTop + 2 + rnd() * bandH,
      r: 0.5 + rnd() * 1.6,
      o: 0.06 + rnd() * 0.3,
    }));
  }, [env.hasGround, vp.groundY, height, width, environmentId]);

  /** Earth gets a fringe of grass along the top edge of the soil. */
  const tufts = useMemo(() => {
    if (environmentId !== 'earth') return [];
    const rnd = seeded(31337 + Math.round(width));
    return Array.from({ length: 64 }, () => {
      const x = rnd() * width;
      const h = 3 + rnd() * 7;
      const lean = (rnd() - 0.5) * 5;
      return { x, h, lean, o: 0.25 + rnd() * 0.45 };
    });
  }, [environmentId, width]);

  // ------------------------------------------------------------ object state
  const landed = frame.impactAge >= 0;
  const speed = frame.speed;

  // Damped rebound after contact: overshoots once or twice, then settles.
  const squashAmount =
    landed && frame.profile
      ? frame.profile.squash * Math.max(0, ring(frame.impactAge, 0.13, 7.5))
      : 0;

  // In-flight stretch along the direction of travel. Area is preserved, so a
  // stretched object looks thinner rather than simply bigger.
  const stretch = phase === 'running' ? clamp(speed / 45, 0, 0.3) : 0;

  const roundish = preset.shape === 'circle' || preset.shape === 'disc';
  const velAngle = (Math.atan2(-frame.vy, frame.vx) * 180) / Math.PI;

  /**
   * Feather tumble.
   *
   * This is a RENDERING effect only — it is applied to the drawn transform and
   * never fed back into the state the integrator sees. That is deliberate: the
   * spec wants a feather that visibly flutters yet still lands at exactly the
   * same instant as a hammer when the air is switched off, and the only way to
   * have both is to keep the wobble out of the equations of motion.
   */
  const tumbleT = frame.t;
  const moving = phase === 'running' && speed > 0.05;
  const tumbleGain = moving ? preset.tumble * clamp(speed / 0.6, 0, 1) : 0;
  const wobbleX =
    tumbleGain * r * 1.15 * Math.sin(tumbleT * 3.3) * Math.sin(tumbleT * 1.21 + 0.7);
  const tumbleRot =
    tumbleGain * (36 * Math.sin(tumbleT * 2.1) + 14 * Math.sin(tumbleT * 4.7 + 1.3));

  const objScreenX = toScreenX(vp, frame.x) + wobbleX;
  // The physics point is the object's contact point, so the drawn body sits one
  // radius above it. That way y = 0 means "resting on the ground", not "half
  // buried in it".
  const footY = toScreenY(vp, frame.y);
  const scaleY = 1 - squashAmount;
  const scaleX = 1 + squashAmount * 0.72;
  const objScreenY = env.hasGround ? footY - r * scaleY : footY;

  // Round objects stretch along their direction of travel; the book and the
  // feather only ever squash vertically, because a stretched book looks wrong.
  const useStretch = roundish && stretch > 0;
  const bodyScaleX = useStretch ? 1 + stretch : scaleX;
  const bodyScaleY = useStretch ? 1 / (1 + stretch) : scaleY;

  const heightFrac = clamp(frame.y / Math.max(bounds.maxY, 1e-6), 0, 1);

  // Screen shake: the whole scene below the sky rings briefly on a hard hit.
  const shakeAmp = landed && frame.profile ? frame.profile.shake : 0;
  const shakeX = shakeAmp * ring(frame.impactAge, 0.1, 13) * 0.6;
  const shakeY = shakeAmp * ring(frame.impactAge + 0.02, 0.1, 17);

  // ------------------------------------------------------------------- trail
  const trailChunks = useMemo(() => {
    const pts = frame.path;
    if (pts.length < 2) return [];
    const CHUNKS = 6;
    const out: { points: string; opacity: number }[] = [];
    for (let i = 0; i < CHUNKS; i++) {
      const a = Math.floor((i * (pts.length - 1)) / CHUNKS);
      const b = Math.floor(((i + 1) * (pts.length - 1)) / CHUNKS);
      if (b - a < 1) continue;
      const slice = pts.slice(a, b + 1);
      out.push({
        points: slice.map((p) => `${toScreenX(vp, p.x)},${toScreenY(vp, p.y)}`).join(' '),
        opacity: 0.06 + 0.5 * ((i + 1) / CHUNKS),
      });
    }
    return out;
  }, [frame.path, vp]);

  const ghostPoints = useMemo(() => {
    if (!ghostPath || ghostPath.length < 2) return null;
    // Thin aggressively; the ghost only needs to read as a shape.
    const step = Math.max(1, Math.floor(ghostPath.length / 90));
    const pts: string[] = [];
    for (let i = 0; i < ghostPath.length; i += step) {
      pts.push(`${toScreenX(vp, ghostPath[i].x)},${toScreenY(vp, ghostPath[i].y)}`);
    }
    return pts.join(' ');
  }, [ghostPath, vp]);

  // Motion-blur echoes: earlier positions from the real path, so the smear
  // follows the actual curve rather than a straight extrapolation.
  const echoes = useMemo(() => {
    if (phase !== 'running' || speed < 6) return [];
    const pts = frame.path;
    const out: { x: number; y: number; o: number }[] = [];
    for (let k = 1; k <= 3; k++) {
      const idx = pts.length - 1 - k * 2;
      if (idx < 0) break;
      out.push({
        x: toScreenX(vp, pts[idx].x),
        y: toScreenY(vp, pts[idx].y) - r,
        o: 0.26 / k,
      });
    }
    return out;
  }, [phase, speed, frame.path, vp, r]);

  const ticks = useMemo(() => rulerTicks(vp), [vp]);
  const groundBandTop = vp.groundY;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.skyTop} />
          <Stop offset="0.55" stopColor={palette.skyMid} />
          <Stop offset="1" stopColor={palette.skyBottom} />
        </LinearGradient>
        <LinearGradient id="soil" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.groundTop} />
          <Stop offset="0.3" stopColor={palette.groundMid} />
          <Stop offset="1" stopColor={palette.groundBottom} />
        </LinearGradient>
        <LinearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.haze} stopOpacity="0" />
          <Stop offset="1" stopColor={palette.haze} stopOpacity="1" />
        </LinearGradient>
        <RadialGradient id="shadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.85" />
          <Stop offset="0.55" stopColor="#000000" stopOpacity="0.4" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* ---- sky ------------------------------------------------------- */}
      <Rect x={0} y={0} width={width} height={height} fill="url(#sky)" />
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.o} />
      ))}
      {env.hasGround ? (
        <Rect
          x={0}
          y={Math.max(groundBandTop - 90, 0)}
          width={width}
          height={90}
          fill="url(#haze)"
          opacity={0.5}
        />
      ) : null}

      {/* Everything from here down participates in the impact shake. */}
      <G transform={`translate(${shakeX.toFixed(2)}, ${shakeY.toFixed(2)})`}>
        {/* ---- ground ------------------------------------------------- */}
        {env.hasGround ? (
          <G>
            <Rect
              x={-10}
              y={groundBandTop}
              width={width + 20}
              height={height - groundBandTop + 40}
              fill="url(#soil)"
            />
            {/* Lit top edge, so the surface reads as a plane rather than a line. */}
            <Rect x={-10} y={groundBandTop} width={width + 20} height={1.6} fill={palette.accent} opacity={0.5} />
            <Rect
              x={-10}
              y={groundBandTop + 1.6}
              width={width + 20}
              height={4}
              fill="#FFFFFF"
              opacity={0.05}
            />
            {tufts.map((t, i) => (
              <Line
                key={`t${i}`}
                x1={t.x}
                y1={groundBandTop + 1}
                x2={t.x + t.lean}
                y2={groundBandTop - t.h}
                stroke={palette.accent}
                strokeWidth={1.2}
                opacity={t.o}
                strokeLinecap="round"
              />
            ))}
            {grit.map((g, i) => (
              <Circle key={`g${i}`} cx={g.x} cy={g.y} r={g.r} fill={palette.grit} opacity={g.o} />
            ))}
            {/* Broad soft bands for depth in the soil. */}
            {[0.3, 0.62].map((f, i) => (
              <Ellipse
                key={`b${i}`}
                cx={width * (i ? 0.7 : 0.3)}
                cy={groundBandTop + (height - groundBandTop) * f}
                rx={width * 0.45}
                ry={6 + i * 4}
                fill="#000000"
                opacity={0.1}
              />
            ))}
          </G>
        ) : (
          /* Zero-G: draw the chamber the object drifts inside. */
          <G>
            <Rect
              x={toScreenX(vp, bounds.minX)}
              y={toScreenY(vp, bounds.maxY)}
              width={(bounds.maxX - bounds.minX) * vp.scale}
              height={(bounds.maxY - bounds.minY) * vp.scale}
              fill="none"
              stroke={palette.accent}
              strokeWidth={1}
              strokeDasharray="6 8"
              opacity={0.34}
              rx={8}
            />
          </G>
        )}

        {/* ---- ghost of the previous run ------------------------------ */}
        {ghostPoints ? (
          <G>
            <Polyline
              points={ghostPoints}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={1.4}
              strokeDasharray="3 5"
              opacity={0.24}
              strokeLinecap="round"
            />
            {ghostLabel ? (
              <SvgText
                x={width - 12}
                y={vp.topY + 12}
                fill="#FFFFFF"
                opacity={0.4}
                fontSize={10}
                textAnchor="end"
              >
                {ghostLabel}
              </SvgText>
            ) : null}
          </G>
        ) : null}

        {/* ---- trajectory trail --------------------------------------- */}
        {trailChunks.map((c, i) => (
          <Polyline
            key={i}
            points={c.points}
            fill="none"
            stroke={palette.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={c.opacity}
          />
        ))}

        {/* ---- contact shadow ----------------------------------------- */}
        {env.hasGround ? (
          <Ellipse
            cx={toScreenX(vp, frame.x)}
            cy={vp.groundY + 2}
            // High up: wide and diffuse. Close in: tight and dark.
            rx={r * (0.9 + heightFrac * 2.4)}
            ry={r * (0.9 + heightFrac * 2.4) * 0.26}
            fill="url(#shadow)"
            opacity={clamp(0.62 * Math.pow(1 - heightFrac, 1.35) + 0.04, 0, 0.7)}
          />
        ) : null}

        {/* ---- motion blur echoes ------------------------------------- */}
        {echoes.map((e, i) => (
          <G key={`e${i}`} transform={`translate(${e.x.toFixed(2)}, ${e.y.toFixed(2)})`} opacity={e.o}>
            <ObjectGlyph
              shape={preset.shape}
              r={r}
              material={preset.material}
              idPrefix={`echo${i}`}
            />
          </G>
        ))}

        {/* ---- the object --------------------------------------------- */}
        <G transform={`translate(${objScreenX.toFixed(2)}, ${objScreenY.toFixed(2)})`}>
          <G transform={`rotate(${(roundish && speed > 2 ? velAngle : tumbleRot).toFixed(2)})`}>
            <G transform={`scale(${bodyScaleX.toFixed(4)}, ${bodyScaleY.toFixed(4)})`}>
              <ObjectGlyph
                shape={preset.shape}
                r={r}
                material={preset.material}
                idPrefix="obj"
              />
            </G>
          </G>
        </G>

        {/* ---- impact debris ------------------------------------------ */}
        {frame.particles.map((p, i) => (
          <Circle
            key={`p${i}`}
            cx={p.x}
            cy={p.y}
            r={p.size}
            fill={palette.grit}
            opacity={clamp(1 - p.age / p.life, 0, 1) * 0.8}
          />
        ))}
      </G>

      {/* ---- height ruler ---------------------------------------------- */}
      <G>
        <Line
          x1={26}
          y1={vp.topY}
          x2={26}
          y2={toScreenY(vp, 0)}
          stroke="#FFFFFF"
          strokeWidth={1}
          opacity={0.22}
        />
        {ticks.map((t, i) => (
          <G key={`r${i}`}>
            <Line
              x1={26}
              y1={t.y}
              x2={t.major ? 34 : 30}
              y2={t.y}
              stroke="#FFFFFF"
              strokeWidth={1}
              opacity={t.major ? 0.4 : 0.2}
            />
            {t.major ? (
              <SvgText x={23} y={t.y + 3.5} fill="#FFFFFF" opacity={0.55} fontSize={9} textAnchor="end">
                {formatTick(t.value)}
              </SvgText>
            ) : null}
          </G>
        ))}
      </G>
    </Svg>
  );
}

function formatTick(v: number): string {
  if (v === 0) return '0';
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(0);
  if (v >= 1) return v.toFixed(v % 1 === 0 ? 0 : 1);
  return v.toFixed(1);
}
