import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import type { BulbOutput, CircuitOutput, WiringMode } from '../../lib/physics/circuit';
import { blend } from '../../lib/color';
import { colors } from '../../theme';

interface Props {
  width: number;
  height: number;
  bulbCount: 1 | 2;
  wiring: WiringMode;
  switchClosed: boolean;
  result: CircuitOutput;
  /** 0..1 transient glow per bulb slot while it is mid-flicker. */
  flicker: number[];
  /** Seconds, monotonically increasing while anything is animating. */
  elapsed: number;
}

// -------------------------------------------------------------- topology --
// A fixed logical coordinate space, scaled to the container by the SVG
// viewBox. There is no physical distance being represented here (unlike the
// drop and collision scenes), so a fixed schematic layout is all this needs.

const VB_W = 340;
const VB_H = 200;
const TL = { x: 30, y: 20 };
const TR = { x: 310, y: 20 };
const BR = { x: 310, y: 180 };
const BL = { x: 30, y: 180 };
const RUNG2_Y = 65;
const BATTERY_TOP = 95; // positive plate
const BATTERY_BOTTOM = 108; // negative plate
const SWITCH_LEFT = 150;
const SWITCH_RIGHT = 190;
const BULB_R = 15;

type Point = { x: number; y: number };

function bulbCenters(bulbCount: 1 | 2, wiring: WiringMode): Point[] {
  if (bulbCount === 1) return [{ x: 170, y: 20 }];
  if (wiring === 'series') return [{ x: 110, y: 20 }, { x: 230, y: 20 }];
  return [{ x: 170, y: 20 }, { x: 170, y: RUNG2_Y }];
}

/** Static wire pieces to draw, each tagged with which current decides its glow. */
function wireSegments(
  bulbCount: 1 | 2,
  wiring: WiringMode,
  centers: Point[]
): { points: [Point, Point]; key: 'total' | 0 | 1 }[] {
  const segs: { points: [Point, Point]; key: 'total' | 0 | 1 }[] = [
    { points: [{ x: 30, y: 20 }, { x: 30, y: BATTERY_TOP }], key: 'total' },
    { points: [{ x: 30, y: BATTERY_BOTTOM }, BL], key: 'total' },
    { points: [BL, { x: SWITCH_LEFT, y: 180 }], key: 'total' },
    { points: [{ x: SWITCH_RIGHT, y: 180 }, BR], key: 'total' },
    { points: [BR, TR], key: 'total' },
  ];

  if (bulbCount === 1) {
    const c = centers[0];
    segs.push({ points: [TL, { x: c.x - BULB_R, y: 20 }], key: 'total' });
    segs.push({ points: [{ x: c.x + BULB_R, y: 20 }, TR], key: 'total' });
  } else if (wiring === 'series') {
    const [a, b] = centers;
    segs.push({ points: [TL, { x: a.x - BULB_R, y: 20 }], key: 'total' });
    segs.push({ points: [{ x: a.x + BULB_R, y: 20 }, { x: b.x - BULB_R, y: 20 }], key: 'total' });
    segs.push({ points: [{ x: b.x + BULB_R, y: 20 }, TR], key: 'total' });
  } else {
    const [a, b] = centers;
    segs.push({ points: [TL, { x: a.x - BULB_R, y: 20 }], key: 0 });
    segs.push({ points: [{ x: a.x + BULB_R, y: 20 }, TR], key: 0 });
    segs.push({ points: [{ x: 30, y: RUNG2_Y }, { x: b.x - BULB_R, y: RUNG2_Y }], key: 1 });
    segs.push({ points: [{ x: b.x + BULB_R, y: RUNG2_Y }, { x: 310, y: RUNG2_Y }], key: 1 });
  }
  return segs;
}

/** Closed loops used to animate the current-flow dots, one per distinct current. */
function flowPaths(
  bulbCount: 1 | 2,
  wiring: WiringMode,
  centers: Point[]
): { key: 'total' | 0 | 1; points: Point[] }[] {
  const tail: Point[] = [
    BR,
    { x: SWITCH_RIGHT, y: 180 },
    { x: SWITCH_LEFT, y: 180 },
    BL,
    { x: 30, y: BATTERY_BOTTOM },
  ];
  if (bulbCount !== 2 || wiring === 'series') {
    return [
      {
        key: 'total',
        points: [{ x: 30, y: BATTERY_TOP }, TL, TR, ...tail],
      },
    ];
  }
  return [
    { key: 0, points: [{ x: 30, y: BATTERY_TOP }, TL, TR, ...tail] },
    {
      key: 1,
      points: [
        { x: 30, y: BATTERY_TOP },
        { x: 30, y: RUNG2_Y },
        { x: 310, y: RUNG2_Y },
        ...tail,
      ],
    },
  ];
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/** Walk a polyline and return the point at `distance` along it, wrapping. */
function pointAtDistance(points: Point[], distance: number, total: number): Point {
  if (total <= 0) return points[0];
  let d = distance % total;
  if (d < 0) d += total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= segLen || i === points.length - 1) {
      const t = segLen > 0 ? d / segLen : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    d -= segLen;
  }
  return points[points.length - 1];
}

const DOT_SPACING = 26;
/** Pixels per second, per amp — faster current visibly moves faster. */
const DOT_SPEED = 130;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function CircuitScene({
  width,
  height,
  bulbCount,
  wiring,
  switchClosed,
  result,
  flicker,
  elapsed,
}: Props) {
  const centers = bulbCenters(bulbCount, wiring);
  const wires = wireSegments(bulbCount, wiring, centers);
  const paths = flowPaths(bulbCount, wiring, centers);

  const currentFor = (key: 'total' | 0 | 1) =>
    key === 'total' ? result.totalCurrent : (result.bulbs[key]?.current ?? 0);

  const scale = Math.min(width / VB_W, height / VB_H);
  const offsetX = (width - VB_W * scale) / 2;
  const offsetY = (height - VB_H * scale) / 2;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        {centers.map((_, i) => (
          <RadialGradient key={`glow${i}`} id={`bulb${i}Glow`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.amber} stopOpacity="0.85" />
            <Stop offset="1" stopColor={colors.amber} stopOpacity="0" />
          </RadialGradient>
        ))}
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={colors.bgElevated} />

      <G transform={`translate(${offsetX.toFixed(2)}, ${offsetY.toFixed(2)}) scale(${scale.toFixed(4)})`}>
        {/* ---- wires ---------------------------------------------------- */}
        {wires.map((seg, i) => {
          const live = currentFor(seg.key) > 1e-6;
          return (
            <Line
              key={`w${i}`}
              x1={seg.points[0].x}
              y1={seg.points[0].y}
              x2={seg.points[1].x}
              y2={seg.points[1].y}
              stroke={live ? colors.accent : colors.stroke}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={live ? 0.9 : 0.7}
            />
          );
        })}

        {/* ---- battery ---------------------------------------------------- */}
        <BatteryGlyph />

        {/* ---- switch ------------------------------------------------------ */}
        <SwitchGlyph closed={switchClosed} />

        {/* ---- current-flow dots -------------------------------------------- */}
        {paths.map((path) => {
          const current = currentFor(path.key);
          if (!switchClosed || current <= 1e-6) return null;
          const total = pathLength(path.points);
          const count = Math.max(4, Math.floor(total / DOT_SPACING));
          const travelled = elapsed * DOT_SPEED * Math.min(current, 2.4);
          return Array.from({ length: count }, (_, i) => {
            const p = pointAtDistance(path.points, travelled + i * (total / count), total);
            return (
              <Circle
                key={`dot-${path.key}-${i}`}
                cx={p.x}
                cy={p.y}
                r={2.6}
                fill={colors.accent}
                opacity={0.85}
              />
            );
          });
        })}

        {/* ---- bulbs -------------------------------------------------------- */}
        {centers.map((c, i) => (
          <BulbGlyph
            key={`bulb${i}`}
            idPrefix={`bulb${i}`}
            x={c.x}
            y={c.y}
            bulb={result.bulbs[i]}
            flicker={flicker[i] ?? 0}
          />
        ))}
      </G>
    </Svg>
  );
}

function BatteryGlyph() {
  return (
    <G>
      <Line
        x1={19}
        y1={BATTERY_TOP}
        x2={41}
        y2={BATTERY_TOP}
        stroke={colors.text}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Line
        x1={22}
        y1={BATTERY_BOTTOM}
        x2={38}
        y2={BATTERY_BOTTOM}
        stroke={colors.text}
        strokeWidth={5.5}
        strokeLinecap="round"
      />
    </G>
  );
}

function SwitchGlyph({ closed }: { closed: boolean }) {
  const span = SWITCH_RIGHT - SWITCH_LEFT;
  const angleDeg = closed ? 0 : -28;
  const rad = (angleDeg * Math.PI) / 180;
  const leverX = SWITCH_LEFT + span * Math.cos(rad);
  const leverY = 180 + span * Math.sin(rad);
  return (
    <G>
      <Circle cx={SWITCH_LEFT} cy={180} r={3} fill={colors.textMuted} />
      <Circle cx={SWITCH_RIGHT} cy={180} r={3} fill={colors.textMuted} />
      <Line
        x1={SWITCH_LEFT}
        y1={180}
        x2={leverX}
        y2={leverY}
        stroke={colors.text}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </G>
  );
}

function BulbGlyph({
  x,
  y,
  bulb,
  flicker,
  idPrefix,
}: {
  x: number;
  y: number;
  bulb: BulbOutput | undefined;
  flicker: number;
  idPrefix: string;
}) {
  if (!bulb) return null;
  const displayBrightness = flicker > 0.02 ? clamp01(flicker) : bulb.brightness;
  const glowR = BULB_R * (2.1 + displayBrightness * 1.6);

  return (
    <G transform={`translate(${x}, ${y})`}>
      {displayBrightness > 0.02 ? (
        <Circle cx={0} cy={0} r={glowR} fill={`url(#${idPrefix}Glow)`} />
      ) : null}
      <Circle
        cx={0}
        cy={0}
        r={BULB_R}
        fill={bulb.burnedOut ? colors.surfaceAlt : colors.bgElevated}
        stroke={bulb.burnedOut ? colors.textFaint : colors.text}
        strokeWidth={1.6}
        opacity={bulb.burnedOut ? 0.7 : 1}
      />
      {/* filament */}
      <Path
        d={`M ${-BULB_R * 0.45} ${BULB_R * 0.4} L ${-BULB_R * 0.15} ${-BULB_R * 0.35} L ${BULB_R * 0.15} ${BULB_R * 0.25} L ${BULB_R * 0.45} ${-BULB_R * 0.4}`}
        stroke={bulb.burnedOut ? colors.textFaint : mixColor(displayBrightness)}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        opacity={bulb.burnedOut ? 0.6 : 0.55 + 0.45 * displayBrightness}
      />
      {bulb.burnedOut ? (
        <Line
          x1={-BULB_R * 0.6}
          y1={-BULB_R * 0.6}
          x2={BULB_R * 0.6}
          y2={BULB_R * 0.6}
          stroke={colors.rose}
          strokeWidth={1.4}
          opacity={0.55}
          strokeLinecap="round"
        />
      ) : null}
    </G>
  );
}

/** Cool grey filament at zero brightness, warming to a bright yellow-white. */
function mixColor(t: number): string {
  const stops: [number, string][] = [
    [0, '#7A8598'],
    [0.5, colors.amber],
    [1, '#FFF3D6'],
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const localT = clamp01((t - lo[0]) / span);
  return blend(lo[1], hi[1], localT);
}

