import { useMemo } from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {
  MAGNET_HALF_LENGTH,
  computeForce,
  fieldVectorAt,
  forceFraction,
  traceFieldLines,
  type Pole,
  type Vec2,
} from '../../lib/physics/magnetism';
import type { DisplayState } from '../../hooks/useMagnetSim';
import { blend } from '../../lib/color';
import { colors } from '../../theme';

interface Props {
  width: number;
  height: number;
  display: DisplayState;
  /** 0..1 transient pulse the instant the magnets snap together. */
  snapPulse: number;
}

const NORTH_COLOR = colors.rose;
const SOUTH_COLOR = colors.blue;
const BAR_THICKNESS_BASE = 0.7;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Deterministic, fixed once — filings live in normalised [-1,1] space and are remapped to world space every render, so they redistribute smoothly as the view zooms rather than being regenerated. */
const FILING_COUNT = 90;
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
const FILING_SEEDS: Vec2[] = (() => {
  const rnd = seeded(20260916);
  return Array.from({ length: FILING_COUNT }, () => ({
    x: rnd() * 2 - 1,
    y: rnd() * 2 - 1,
  }));
})();

export function MagnetScene({ width, height, display, snapPulse }: Props) {
  const { distance, strengthA, strengthB, orientationT } = display;

  const worldHalfWidth = distance / 2 + MAGNET_HALF_LENGTH + Math.max(4, distance * 0.25);
  const worldHalfHeight = worldHalfWidth * 0.62;
  const scale = Math.min(width / (2 * worldHalfWidth), height / (2 * worldHalfHeight));
  const cx = width / 2;
  const cy = height / 2;
  const toScreen = (p: Vec2) => ({ x: cx + p.x * scale, y: cy - p.y * scale });

  const centerA = -distance / 2;
  const centerB = distance / 2;

  // Magnet A never flips: north is always on its outward (left) end.
  const poleA: [Pole, Pole] = [
    { x: centerA - MAGNET_HALF_LENGTH, y: 0, strength: strengthA },
    { x: centerA + MAGNET_HALF_LENGTH, y: 0, strength: -strengthA },
  ];
  // Magnet B's facing (left) pole eases smoothly from south (repel, t=0) to
  // north (attract, t=1) by letting its strength ease through zero — no
  // pole ever jumps position, so the flip animates as a natural re-polarise.
  const bLeftStrength = strengthB * (2 * orientationT - 1);
  const poleB: [Pole, Pole] = [
    { x: centerB - MAGNET_HALF_LENGTH, y: 0, strength: bLeftStrength },
    { x: centerB + MAGNET_HALF_LENGTH, y: 0, strength: -bLeftStrength },
  ];
  const allPoles = [...poleA, ...poleB];

  const bLeftColor = blend(SOUTH_COLOR, NORTH_COLOR, orientationT);
  const bRightColor = blend(NORTH_COLOR, SOUTH_COLOR, orientationT);

  const bounds = {
    minX: -worldHalfWidth,
    maxX: worldHalfWidth,
    minY: -worldHalfHeight,
    maxY: worldHalfHeight,
  };

  const fieldLines = useMemo(() => {
    const stepLength = worldHalfWidth / 55;
    const lineFor = (strength: number) => ({
      count: Math.round(3 + (clamp01(strength / 100) * 6)),
      maxSteps: Math.round(35 + clamp01(strength / 100) * 55),
      stepLength,
      captureRadius: MAGNET_HALF_LENGTH * 0.55,
      bounds,
    });
    return [
      ...traceFieldLines(poleA, lineFor(strengthA)),
      ...traceFieldLines(poleB, lineFor(Math.abs(bLeftStrength))),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distance, strengthA, strengthB, orientationT, worldHalfWidth, worldHalfHeight]);

  const filings = useMemo(
    () =>
      FILING_SEEDS.map((seed) => {
        const wx = seed.x * worldHalfWidth;
        const wy = seed.y * worldHalfHeight;
        const field = fieldVectorAt(wx, wy, allPoles);
        const mag = Math.hypot(field.x, field.y);
        const angle = Math.atan2(-field.y, field.x); // screen space: y flips
        // Fade both very weak (far away) and absurdly strong (right on a
        // pole) readings, so the filings read as a field, not noise.
        const opacity = clamp01(Math.log10(1 + mag) / 2.4) * 0.8;
        return { x: wx, y: wy, angle, opacity };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [distance, strengthA, strengthB, orientationT, worldHalfWidth, worldHalfHeight]
  );

  const force = computeForce({ distance, strengthA, strengthB, orientation: orientationT >= 0.5 ? 'attract' : 'repel' });
  const intensity = forceFraction(force.magnitude);
  const pulse = 1 + snapPulse * 0.12;

  const glowColor = force.attracting ? colors.accent : colors.rose;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <RadialGradient id="magnetGlowA" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={glowColor} stopOpacity={0.55} />
          <Stop offset="1" stopColor={glowColor} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={colors.bgElevated} />

      {/* ---- field lines -------------------------------------------------- */}
      <G opacity={0.55}>
        {fieldLines.map((line, i) => (
          <Polyline
            key={`fl${i}`}
            points={line.points.map((p) => {
              const s = toScreen(p);
              return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
            }).join(' ')}
            fill="none"
            stroke={colors.textMuted}
            strokeWidth={1}
            strokeLinecap="round"
          />
        ))}
      </G>

      {/* ---- iron filings --------------------------------------------------- */}
      <G>
        {filings.map((f, i) => {
          if (f.opacity < 0.03) return null;
          const s = toScreen({ x: f.x, y: f.y });
          const len = 4.5;
          const dx = (Math.cos(f.angle) * len) / 2;
          const dy = (Math.sin(f.angle) * len) / 2;
          return (
            <Line
              key={`fil${i}`}
              x1={s.x - dx}
              y1={s.y - dy}
              x2={s.x + dx}
              y2={s.y + dy}
              stroke={colors.text}
              strokeWidth={1.1}
              strokeLinecap="round"
              opacity={f.opacity}
            />
          );
        })}
      </G>

      {/* ---- force indicator ------------------------------------------------ */}
      <ForceArrow toScreen={toScreen} attracting={force.attracting} intensity={intensity} />

      {/* ---- magnets ---------------------------------------------------------- */}
      <MagnetBar
        toScreen={toScreen}
        scale={scale}
        centerX={centerA}
        leftColor={NORTH_COLOR}
        rightColor={SOUTH_COLOR}
        leftLabel="N"
        rightLabel="S"
        glowIntensity={intensity}
        glowColor={glowColor}
        pulse={pulse}
        strengthFrac={clamp01(strengthA / 100)}
        idPrefix="magA"
      />
      <MagnetBar
        toScreen={toScreen}
        scale={scale}
        centerX={centerB}
        leftColor={bLeftColor}
        rightColor={bRightColor}
        leftLabel={orientationT >= 0.5 ? 'N' : 'S'}
        rightLabel={orientationT >= 0.5 ? 'S' : 'N'}
        glowIntensity={intensity}
        glowColor={glowColor}
        pulse={pulse}
        strengthFrac={clamp01(strengthB / 100)}
        idPrefix="magB"
      />
    </Svg>
  );
}

function MagnetBar({
  toScreen,
  scale,
  centerX,
  leftColor,
  rightColor,
  leftLabel,
  rightLabel,
  glowIntensity,
  glowColor,
  pulse,
  strengthFrac,
  idPrefix,
}: {
  toScreen: (p: Vec2) => { x: number; y: number };
  scale: number;
  centerX: number;
  leftColor: string;
  rightColor: string;
  leftLabel: string;
  rightLabel: string;
  glowIntensity: number;
  glowColor: string;
  pulse: number;
  strengthFrac: number;
  idPrefix: string;
}) {
  const center = toScreen({ x: centerX, y: 0 });
  const halfLenPx = MAGNET_HALF_LENGTH * scale * pulse;
  const thicknessPx = (BAR_THICKNESS_BASE + 0.5 * strengthFrac) * scale * pulse;
  const glowR = halfLenPx * (2.2 + glowIntensity * 1.4);

  return (
    <G>
      {glowIntensity > 0.03 ? (
        <Circle cx={center.x} cy={center.y} r={glowR} fill="url(#magnetGlowA)" opacity={glowIntensity} />
      ) : null}
      <G transform={`translate(${center.x.toFixed(2)}, ${center.y.toFixed(2)})`}>
        <Rect
          x={-halfLenPx}
          y={-thicknessPx / 2}
          width={halfLenPx}
          height={thicknessPx}
          fill={leftColor}
          stroke={colors.bg}
          strokeWidth={1}
        />
        <Rect
          x={0}
          y={-thicknessPx / 2}
          width={halfLenPx}
          height={thicknessPx}
          fill={rightColor}
          stroke={colors.bg}
          strokeWidth={1}
        />
        <SvgText
          x={-halfLenPx / 2}
          y={4}
          fill={colors.bg}
          fontSize={Math.max(9, thicknessPx * 0.55)}
          fontWeight="700"
          textAnchor="middle"
        >
          {leftLabel}
        </SvgText>
        <SvgText
          x={halfLenPx / 2}
          y={4}
          fill={colors.bg}
          fontSize={Math.max(9, thicknessPx * 0.55)}
          fontWeight="700"
          textAnchor="middle"
        >
          {rightLabel}
        </SvgText>
      </G>
    </G>
  );
}

function ForceArrow({
  toScreen,
  attracting,
  intensity,
}: {
  toScreen: (p: Vec2) => { x: number; y: number };
  attracting: boolean;
  intensity: number;
}) {
  if (intensity < 0.04) return null;
  const gap = 8 + intensity * 22;
  const armLen = 6 + intensity * 20;
  const color = attracting ? colors.accent : colors.rose;

  // Attract: arrows point inward, toward the centre. Repel: outward.
  const leftTip = attracting ? -gap + armLen : -gap;
  const leftTail = attracting ? -gap : -gap + armLen;
  const rightTip = attracting ? gap - armLen : gap;
  const rightTail = attracting ? gap : gap - armLen;

  const midY = toScreen({ x: 0, y: 0 }).y;
  const toX = (wx: number) => toScreen({ x: wx, y: 0 }).x;

  return (
    <G opacity={0.5 + intensity * 0.5}>
      <Arrow x1={toX(leftTail)} x2={toX(leftTip)} y={midY} color={color} />
      <Arrow x1={toX(rightTail)} x2={toX(rightTip)} y={midY} color={color} />
    </G>
  );
}

function Arrow({ x1, x2, y, color }: { x1: number; x2: number; y: number; color: string }) {
  const dir = x2 > x1 ? 1 : -1;
  const headSize = 5;
  return (
    <G>
      <Line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <Path
        d={`M ${x2} ${y} L ${x2 - dir * headSize} ${y - headSize * 0.7} L ${x2 - dir * headSize} ${y + headSize * 0.7} Z`}
        fill={color}
      />
    </G>
  );
}
