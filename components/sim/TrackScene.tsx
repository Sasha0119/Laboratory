import { useEffect, useMemo } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { ring } from '../../lib/effects/impact';
import type { ObjectPreset } from '../../lib/physics/presets';
import type { CollisionFrame } from '../../hooks/useCollisionSim';
import { colors } from '../../theme';
import { ObjectGlyph } from './ObjectGlyph';

interface Props {
  width: number;
  height: number;
  halfTrack: number;
  presetA: ObjectPreset;
  presetB: ObjectPreset;
  /** Contact half-widths in metres — identical to what is drawn. */
  radiusA: number;
  radiusB: number;
  frame: CollisionFrame;
  running: boolean;
  onProjector: (fn: ((worldX: number) => { x: number; y: number }) | null) => void;
}

const PAD = 24;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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

/** Metres-to-pixels for the track. Uniform, so relative sizes stay honest. */
export function trackScale(width: number, halfTrack: number): number {
  return (width - PAD * 2) / (2 * halfTrack);
}

export function TrackScene({
  width,
  height,
  halfTrack,
  presetA,
  presetB,
  radiusA,
  radiusB,
  frame,
  running,
  onProjector,
}: Props) {
  const scale = trackScale(width, halfTrack);
  const centreX = width / 2;
  /** Top surface of the rail; objects rest on it. */
  const railY = height * 0.66;

  const toScreen = useMemo(
    () => (worldX: number) => centreX + worldX * scale,
    [centreX, scale]
  );

  useEffect(() => {
    onProjector((worldX) => ({ x: toScreen(worldX), y: railY }));
    return () => onProjector(null);
  }, [toScreen, railY, onProjector]);

  const rA = radiusA * scale;
  const rB = radiusB * scale;

  const landed = frame.impactAge >= 0;
  const shakeAmp = landed && frame.profile ? frame.profile.shake : 0;
  const shakeX = shakeAmp * ring(frame.impactAge, 0.1, 13) * 0.7;
  const shakeY = shakeAmp * ring(frame.impactAge + 0.02, 0.1, 17) * 0.5;

  // Squash is applied along the direction of travel, so bodies flatten against
  // each other at the moment of contact.
  const squash =
    landed && frame.profile
      ? frame.profile.squash * Math.max(0, ring(frame.impactAge, 0.12, 8))
      : 0;

  const speedA = Math.abs(frame.aVelocity);
  const speedB = Math.abs(frame.bVelocity);

  const ticks = useMemo(() => {
    const out: { x: number; v: number }[] = [];
    const step = halfTrack <= 3 ? 0.5 : 1;
    for (let v = -halfTrack; v <= halfTrack + 1e-9; v += step) {
      out.push({ x: toScreen(v), v });
    }
    return out;
  }, [halfTrack, toScreen]);

  const grit = useMemo(() => {
    const rnd = seeded(Math.round(width) * 7919 + 13);
    return Array.from({ length: 70 }, () => ({
      x: rnd() * width,
      y: railY + 4 + rnd() * (height - railY - 8),
      r: 0.5 + rnd() * 1.4,
      o: 0.05 + rnd() * 0.22,
    }));
  }, [width, height, railY]);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="tsky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0B1220" />
          <Stop offset="1" stopColor="#141D2E" />
        </LinearGradient>
        <LinearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3A4759" />
          <Stop offset="0.18" stopColor="#252F3E" />
          <Stop offset="1" stopColor="#121924" />
        </LinearGradient>
        <LinearGradient id="railTop" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} stopOpacity="0.5" />
          <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Rect x={0} y={0} width={width} height={height} fill="url(#tsky)" />

      <G transform={`translate(${shakeX.toFixed(2)}, ${shakeY.toFixed(2)})`}>
        {/* ---- the rail --------------------------------------------- */}
        <Rect
          x={-10}
          y={railY}
          width={width + 20}
          height={height - railY + 30}
          fill="url(#rail)"
        />
        <Rect x={-10} y={railY} width={width + 20} height={2} fill={colors.accent} opacity={0.45} />
        <Rect x={-10} y={railY + 2} width={width + 20} height={7} fill="url(#railTop)" />
        {grit.map((g, i) => (
          <Circle key={`g${i}`} cx={g.x} cy={g.y} r={g.r} fill="#FFFFFF" opacity={g.o} />
        ))}

        {/* ---- distance markings ------------------------------------ */}
        {ticks.map((t, i) => {
          const major = Math.abs(t.v - Math.round(t.v)) < 1e-6;
          return (
            <G key={`t${i}`}>
              <Line
                x1={t.x}
                y1={railY + 6}
                x2={t.x}
                y2={railY + (major ? 16 : 11)}
                stroke="#FFFFFF"
                strokeWidth={1}
                opacity={major ? 0.32 : 0.16}
              />
              {major ? (
                <SvgText
                  x={t.x}
                  y={railY + 28}
                  fill="#FFFFFF"
                  opacity={0.4}
                  fontSize={9}
                  textAnchor="middle"
                >
                  {t.v === 0 ? '0' : t.v.toFixed(0)}
                </SvgText>
              ) : null}
            </G>
          );
        })}

        {/* ---- end stops -------------------------------------------- */}
        {[-halfTrack, halfTrack].map((edge, i) => (
          <Rect
            key={`stop${i}`}
            x={toScreen(edge) - (i === 0 ? 7 : 0)}
            y={railY - 46}
            width={7}
            height={48}
            rx={2}
            fill="#4A5768"
            opacity={0.75}
          />
        ))}

        {/* ---- motion trails ---------------------------------------- */}
        <TrailStreak
          trail={frame.trailA}
          toScreen={toScreen}
          y={railY - rA}
          r={rA}
          speed={speedA}
          running={running}
          color={colors.accent}
        />
        <TrailStreak
          trail={frame.trailB}
          toScreen={toScreen}
          y={railY - rB}
          r={rB}
          speed={speedB}
          running={running}
          color={colors.blue}
        />

        {/* ---- contact shadows -------------------------------------- */}
        <Ellipse cx={toScreen(frame.aPosition)} cy={railY + 2} rx={rA * 1.05} ry={rA * 0.22} fill="#000" opacity={0.4} />
        <Ellipse cx={toScreen(frame.bPosition)} cy={railY + 2} rx={rB * 1.05} ry={rB * 0.22} fill="#000" opacity={0.4} />

        {/* ---- the weld, when they have stuck together --------------- */}
        {frame.stuck ? (
          <Rect
            x={toScreen(frame.aPosition)}
            y={railY - Math.min(rA, rB) * 1.15}
            width={Math.max(toScreen(frame.bPosition) - toScreen(frame.aPosition), 1)}
            height={Math.min(rA, rB) * 1.15}
            fill={colors.amber}
            opacity={0.22}
            rx={3}
          />
        ) : null}

        {/* ---- the two bodies --------------------------------------- */}
        <Body
          preset={presetA}
          x={toScreen(frame.aPosition)}
          y={railY - rA}
          r={rA}
          squash={squash}
          /* Squash pushes A rightward into the contact, B leftward. */
          direction={1}
          idPrefix="colA"
        />
        <Body
          preset={presetB}
          x={toScreen(frame.bPosition)}
          y={railY - rB}
          r={rB}
          squash={squash}
          direction={-1}
          idPrefix="colB"
        />

        {/* ---- impact debris ---------------------------------------- */}
        {frame.particles.map((p, i) => (
          <Circle
            key={`p${i}`}
            cx={p.x}
            cy={p.y}
            r={p.size}
            fill="#D8E4F5"
            opacity={clamp(1 - p.age / p.life, 0, 1) * 0.75}
          />
        ))}
      </G>
    </Svg>
  );
}

/**
 * A body, flattened along the track at the moment of impact. Area is roughly
 * preserved — it gets shorter horizontally and taller vertically — which is
 * what makes a hard hit read as a hard hit.
 */
function Body({
  preset,
  x,
  y,
  r,
  squash,
  direction,
  idPrefix,
}: {
  preset: ObjectPreset;
  x: number;
  y: number;
  r: number;
  squash: number;
  direction: number;
  idPrefix: string;
}) {
  const sx = 1 - squash;
  const sy = 1 + squash * 0.7;
  // Shift the centre so the contact face stays put while the body compresses.
  const shift = direction * r * squash * 0.5;
  return (
    <G transform={`translate(${(x - shift).toFixed(2)}, ${(y + r - r * sy).toFixed(2)})`}>
      <G transform={`scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`}>
        <ObjectGlyph shape={preset.shape} r={r} material={preset.material} idPrefix={idPrefix} />
      </G>
    </G>
  );
}

/** Horizontal smear behind a body that is moving quickly. */
function TrailStreak({
  trail,
  toScreen,
  y,
  r,
  speed,
  running,
  color,
}: {
  trail: number[];
  toScreen: (x: number) => number;
  y: number;
  r: number;
  speed: number;
  running: boolean;
  color: string;
}) {
  if (!running || speed < 1.2 || trail.length < 2) return null;
  const head = toScreen(trail[trail.length - 1]);
  // Length grows with speed, capped so it never spans the whole track.
  const tailIndex = Math.max(0, trail.length - 1 - Math.round(clamp(speed * 2, 2, 14)));
  const tail = toScreen(trail[tailIndex]);
  const left = Math.min(head, tail);
  const w = Math.abs(head - tail);
  if (w < 2) return null;
  return (
    <Rect
      x={left}
      y={y - r * 0.45}
      width={w}
      height={r * 0.9}
      rx={r * 0.45}
      fill={color}
      opacity={clamp(speed / 30, 0.06, 0.24)}
    />
  );
}
