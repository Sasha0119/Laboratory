import { useMemo, type ReactNode } from 'react';

import Svg, { Circle, ClipPath, Defs, G, Line, Path, Polygon, Rect, SvgText } from '../dom/svg';
import { leverAngle, pulleyLayout, type LeverGeometry } from '../../lib/physics/machines';
import { colors } from '../../theme';

/**
 * The three drawings of the Simple Machines module: a lever, a ramp and a block
 * and tackle. Each is a pure picture of the numbers it is given; the physics and
 * the motion live elsewhere. Heights, lengths and angles are drawn to scale, so
 * the trade between force and distance can be read off the picture.
 *
 * Arrows share one scale within a scene (so a longer arrow is a bigger force),
 * and turn rose with a shake when the effort is not enough.
 */

const WOOD = '#C79A5B';
const WOOD_DARK = '#8F6A38';
const STEEL = '#7C8BA3';
const LOAD = colors.blue;
const LOAD_DARK = '#2F6DC4';
const ROPE = '#E6D7B2';
const GROUND = colors.surfaceAlt;
const ARROW_MAX = 64;
const ARROW_MIN = 8;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/** Side of the cube drawn for a load, m. */
export function boxSide(mass: number): number {
  return 0.3 + 0.32 * Math.cbrt(Math.max(0, mass) / 50);
}

/** Length of an arrow for a force, px. All arrows in a scene share `maxForce`. */
function arrowLength(force: number, maxForce: number): number {
  if (force <= 0 || maxForce <= 0) return 0;
  return Math.max(ARROW_MIN, (ARROW_MAX * force) / maxForce);
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
  color,
  width = 3,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width?: number;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 2) return null;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.min(11, len * 0.6);
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const half = head * 0.52;
  return (
    <G>
      <Line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeLinecap="round" />
      <Polygon
        points={`${x2},${y2} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`}
        fill={color}
      />
    </G>
  );
}

/** A label that stays readable on the dark canvas. */
function Label({
  x,
  y,
  text,
  color = colors.textMuted,
  size = 11,
  anchor = 'middle',
  weight = 600,
}: {
  x: number;
  y: number;
  text: string;
  color?: string;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  weight?: number;
}) {
  return (
    <SvgText
      x={x}
      y={y}
      fill={color}
      fontSize={size}
      fontWeight={weight}
      textAnchor={anchor}
      style={{ userSelect: 'none', fontVariantNumeric: 'tabular-nums' }}
    >
      {text}
    </SvgText>
  );
}

function LoadBox({ x, y, side, text }: { x: number; y: number; side: number; text: string }) {
  return (
    <G>
      <Rect x={x} y={y} width={side} height={side} rx={3} fill={LOAD} stroke={LOAD_DARK} strokeWidth={1.5} />
      <Rect x={x + 3} y={y + 3} width={side - 6} height={Math.max(2, side * 0.18)} rx={2} fill="rgba(255,255,255,0.22)" />
      {side >= 30 ? (
        <SvgText
          x={x + side / 2}
          y={y + side / 2 + 4.5}
          textAnchor="middle"
          fontSize={Math.min(12, side * 0.3)}
          fontWeight={800}
          fill="#06101F"
          style={{ userSelect: 'none' }}
        >
          {text}
        </SvgText>
      ) : null}
    </G>
  );
}

/** Wraps a force arrow so it can shake and change colour when the effort falls short. */
function EffortMark({
  enough,
  shakeKey,
  children,
}: {
  enough: boolean;
  shakeKey: number;
  children: (color: string) => ReactNode;
}) {
  const color = enough ? colors.accent : colors.rose;
  return (
    <G key={shakeKey} className={!enough && shakeKey > 0 ? 'machine-shake' : undefined}>
      {children(color)}
    </G>
  );
}

// ------------------------------------------------------------------- lever --

interface LeverSceneProps {
  width: number;
  height: number;
  geometry: LeverGeometry;
  /** 0 = load on the ground, 1 = fully raised */
  progress: number;
  loadMass: number;
  /** N */
  loadForce: number;
  effort: number;
  effortRequired: number;
  enough: boolean;
  shakeKey: number;
  labels: {
    load: string;
    loadForce: string;
    effortForce: string;
    loadArm: string;
    effortArm: string;
    pivot: string;
  };
}

export function LeverScene({
  width,
  height,
  geometry: g,
  progress,
  loadMass,
  loadForce,
  effort,
  effortRequired,
  enough,
  shakeKey,
  labels,
}: LeverSceneProps) {
  const thickness = 0.14;
  const side = boxSide(loadMass);
  const length = g.loadArm + g.effortArm;

  const view = useMemo(() => {
    const padX = 26;
    const padBottom = 50;
    const padTop = ARROW_MAX + 34;
    const loadTop = g.pivotHeight + g.loadArm * Math.sin(g.maxAngle) + side + thickness;
    const effortTop = g.pivotHeight + g.effortArm * Math.sin(g.restAngle) + thickness;
    const worldH = Math.max(loadTop, effortTop, 1);
    const s = Math.max(
      10,
      Math.min((width - 2 * padX) / (length + 0.7), (height - padBottom - padTop) / worldH)
    );
    const groundY = height - padBottom;
    return { s, groundY };
  }, [width, height, g, side, length]);

  const { s, groundY } = view;
  const cx = width / 2;
  const loadX = cx - (length / 2) * s;
  const pivotX = loadX + g.loadArm * s;
  const pivotY = groundY - (g.pivotHeight + thickness / 2) * s;

  const angle = leverAngle(g, progress);
  const deg = (angle * 180) / Math.PI;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Where the two ends are on screen, for the arrows.
  const loadEnd = { x: pivotX - g.loadArm * s * cos, y: pivotY - g.loadArm * s * sin };
  const effortEnd = { x: pivotX + g.effortArm * s * cos, y: pivotY + g.effortArm * s * sin };

  const maxForce = Math.max(loadForce, effort, effortRequired, 1);
  const loadLen = arrowLength(loadForce, maxForce);
  const effortLen = arrowLength(effort, maxForce);

  const boxPx = side * s;
  const topOfLoad = loadEnd.y - (thickness / 2) * s - boxPx;
  const topOfEffort = effortEnd.y - (thickness / 2) * s;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Ground */}
      <Rect x={0} y={groundY} width={width} height={height - groundY} fill={GROUND} opacity={0.55} />
      <Line x1={0} y1={groundY} x2={width} y2={groundY} stroke={colors.stroke} strokeWidth={2} />

      {/* Fulcrum */}
      <Polygon
        points={`${pivotX},${pivotY + (thickness / 2) * s} ${pivotX - 0.3 * s},${groundY} ${pivotX + 0.3 * s},${groundY}`}
        fill={STEEL}
        stroke="#4A566B"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* The plank, the load and the pivot pin turn together */}
      <G transform={`translate(${pivotX} ${pivotY}) rotate(${deg})`}>
        <Rect
          x={-(g.loadArm + 0.22) * s}
          y={(-thickness / 2) * s}
          width={(length + 0.44) * s}
          height={thickness * s}
          rx={3}
          fill={WOOD}
          stroke={WOOD_DARK}
          strokeWidth={1.5}
        />
        <G transform={`translate(${-g.loadArm * s - boxPx / 2} ${(-thickness / 2) * s - boxPx})`}>
          <LoadBox x={0} y={0} side={boxPx} text={labels.load} />
        </G>
        <Circle cx={0} cy={0} r={Math.max(3, 0.05 * s)} fill="#2B3447" stroke={colors.textFaint} strokeWidth={1} />
      </G>

      {/* Force arrows, drawn to one scale */}
      {loadLen > 0 ? (
        <G>
          <Arrow
            x1={loadEnd.x}
            y1={topOfLoad - 4 - loadLen}
            x2={loadEnd.x}
            y2={topOfLoad - 4}
            color={colors.amber}
          />
          <Label x={loadEnd.x} y={topOfLoad - 10 - loadLen} text={labels.loadForce} color={colors.amber} />
        </G>
      ) : null}
      <EffortMark enough={enough} shakeKey={shakeKey}>
        {(color) =>
          effortLen > 0 ? (
            <G>
              <Arrow
                x1={effortEnd.x}
                y1={topOfEffort - 4 - effortLen}
                x2={effortEnd.x}
                y2={topOfEffort - 4}
                color={color}
              />
              <Label x={effortEnd.x} y={topOfEffort - 10 - effortLen} text={labels.effortForce} color={color} />
            </G>
          ) : null
        }
      </EffortMark>

      {/* Arm lengths, measured along the ground so they stay put while the plank swings */}
      <G opacity={0.9}>
        <Line x1={loadX} y1={groundY + 14} x2={pivotX} y2={groundY + 14} stroke={colors.amber} strokeWidth={1.5} />
        <Line x1={loadX} y1={groundY + 9} x2={loadX} y2={groundY + 19} stroke={colors.amber} strokeWidth={1.5} />
        <Line x1={pivotX} y1={groundY + 9} x2={pivotX} y2={groundY + 19} stroke={colors.amber} strokeWidth={1.5} />
        <Label x={(loadX + pivotX) / 2} y={groundY + 33} text={labels.loadArm} color={colors.amber} />

        <Line x1={pivotX} y1={groundY + 14} x2={pivotX + g.effortArm * s} y2={groundY + 14} stroke={colors.accent} strokeWidth={1.5} />
        <Line x1={pivotX + g.effortArm * s} y1={groundY + 9} x2={pivotX + g.effortArm * s} y2={groundY + 19} stroke={colors.accent} strokeWidth={1.5} />
        <Label x={pivotX + (g.effortArm * s) / 2} y={groundY + 33} text={labels.effortArm} color={colors.accent} />
      </G>
      <Label x={pivotX} y={groundY + 46} text={labels.pivot} color={colors.textFaint} size={10} />
    </Svg>
  );
}

// ------------------------------------------------------------------- ramp --

interface InclineSceneProps {
  width: number;
  height: number;
  /** Slope length, m */
  length: number;
  /** Rise, m */
  rise: number;
  /** The box on the ramp: 0 = at the foot, 1 = at the top */
  progress: number;
  /** The box lifted straight up beside it */
  liftProgress: number;
  loadMass: number;
  loadForce: number;
  effort: number;
  effortRequired: number;
  enough: boolean;
  canLiftStraight: boolean;
  shakeKey: number;
  labels: {
    load: string;
    length: string;
    height: string;
    push: string;
    lift: string;
  };
}

export function InclineScene({
  width,
  height,
  length,
  rise,
  progress,
  liftProgress,
  loadMass,
  loadForce,
  effort,
  effortRequired,
  enough,
  canLiftStraight,
  shakeKey,
  labels,
}: InclineSceneProps) {
  const side = boxSide(loadMass);
  const run = Math.sqrt(Math.max(0, length * length - rise * rise));
  const theta = Math.asin(Math.min(1, rise / length));
  const deg = (theta * 180) / Math.PI;

  const foot = 0.7; // flat ground in front of the ramp
  const landing = 0.6; // flat top
  const gap = 0.7;
  const column = 1.3;
  const totalW = foot + run + landing + gap + column;

  const padX = 18;
  const padBottom = 36;
  const padTop = ARROW_MAX + 30;
  const s = Math.max(
    8,
    Math.min((width - 2 * padX) / totalW, (height - padBottom - padTop) / (rise + side))
  );
  const groundY = height - padBottom;
  const footX = (width - totalW * s) / 2 + foot * s;
  const topX = footX + run * s;
  const topY = groundY - rise * s;
  const colX = topX + (landing + gap + column / 2) * s;

  const boxPx = Math.max(14, side * s);

  // The box on the ramp. It starts level on the ground, tilts onto the slope and
  // levels off again on the landing.
  const d = clamp01(progress) * length;
  const onSlope = Math.min(smooth(d / side), smooth((length - d) / side));
  const boxAngle = deg * onSlope;
  const bx = footX + d * Math.cos(theta) * s;
  const by = groundY - d * Math.sin(theta) * s;

  // The same box lifted straight up.
  const liftY = groundY - clamp01(liftProgress) * rise * s;

  const maxForce = Math.max(loadForce, effort, effortRequired, 1);
  const pushLen = arrowLength(effort, maxForce);
  const liftLen = arrowLength(effort, maxForce);
  const pushColor = enough ? colors.accent : colors.rose;
  const liftColor = canLiftStraight ? colors.accent : colors.rose;

  const cutId = 'incline-cut';
  const mid = { x: footX + (run / 2) * s, y: groundY - (rise / 2) * s };

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <ClipPath id={cutId}>
          <Rect x={0} y={0} width={width} height={groundY} />
        </ClipPath>
      </Defs>

      <Rect x={0} y={groundY} width={width} height={height - groundY} fill={GROUND} opacity={0.55} />

      {/* The ramp: a solid wedge with a flat top */}
      <Polygon
        points={`${footX},${groundY} ${topX + landing * s},${groundY} ${topX + landing * s},${topY} ${topX},${topY}`}
        fill={WOOD}
        fillOpacity={0.28}
      />
      <Path
        d={`M ${footX - foot * s} ${groundY} L ${footX} ${groundY} L ${topX} ${topY} L ${topX + landing * s} ${topY}`}
        fill="none"
        stroke={WOOD}
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Line x1={0} y1={groundY} x2={width} y2={groundY} stroke={colors.stroke} strokeWidth={2} />

      {/* Length along the slope, and the height it climbs */}
      <G transform={`rotate(${-deg} ${mid.x} ${mid.y})`}>
        <Label x={mid.x} y={mid.y + 20} text={labels.length} color={colors.amber} />
      </G>
      <Line x1={topX + landing * s + 6} y1={groundY} x2={topX + landing * s + 6} y2={topY} stroke={colors.amber} strokeWidth={1.5} strokeDasharray="3 3" />
      <Label x={topX + landing * s + 12} y={(groundY + topY) / 2 + 4} text={labels.height} color={colors.amber} anchor="start" />
      <Line x1={topX + landing * s + 6} y1={topY} x2={colX + (column / 2) * s} y2={topY} stroke={colors.textFaint} strokeWidth={1} strokeDasharray="2 4" />

      {/* The box on the ramp */}
      <G clipPath={`url(#${cutId})`}>
        <G transform={`translate(${bx} ${by}) rotate(${-boxAngle})`}>
          <LoadBox x={-boxPx / 2} y={-boxPx} side={boxPx} text={labels.load} />
        </G>
      </G>

      {/* The push along the slope */}
      <EffortMark enough={enough} shakeKey={shakeKey}>
        {() =>
          pushLen > 0 ? (
            <G transform={`translate(${bx} ${by}) rotate(${-boxAngle})`}>
              <Arrow x1={-boxPx / 2 - pushLen} y1={-boxPx - 8} x2={-boxPx / 2 + 2} y2={-boxPx - 8} color={pushColor} />
              <Label x={-boxPx / 2 - pushLen / 2} y={-boxPx - 14} text={labels.push} color={pushColor} />
            </G>
          ) : null
        }
      </EffortMark>

      {/* The same box, lifted straight up */}
      <Line x1={colX} y1={groundY} x2={colX} y2={topY} stroke={colors.textFaint} strokeWidth={1} strokeDasharray="2 4" />
      <LoadBox x={colX - boxPx / 2} y={liftY - boxPx} side={boxPx} text={labels.load} />
      <G key={`lift-${shakeKey}`} className={!canLiftStraight && shakeKey > 0 ? 'machine-shake' : undefined}>
        <Arrow x1={colX} y1={liftY - boxPx - 4} x2={colX} y2={liftY - boxPx - 4 - Math.max(liftLen, ARROW_MIN)} color={liftColor} />
        <Label x={colX} y={liftY - boxPx - 10 - Math.max(liftLen, ARROW_MIN)} text={labels.lift} color={liftColor} />
      </G>
    </Svg>
  );
}

// ------------------------------------------------------------------ pulley --

interface PulleySceneProps {
  width: number;
  height: number;
  pulleys: number;
  /** 0 = load at the bottom, 1 = fully raised */
  progress: number;
  /** How far the load rises when the progress is 1, m */
  travel: number;
  loadMass: number;
  loadForce: number;
  effort: number;
  effortRequired: number;
  enough: boolean;
  shakeKey: number;
  labels: {
    load: string;
    loadForce: string;
    effortForce: string;
  };
}

const PULLEY_R = 0.22;
const WORLD_H = 4.9;

export function PulleyScene({
  width,
  height,
  pulleys,
  progress,
  travel,
  loadMass,
  loadForce,
  effort,
  effortRequired,
  enough,
  shakeKey,
  labels,
}: PulleySceneProps) {
  const layout = useMemo(() => pulleyLayout(pulleys), [pulleys]);
  const n = layout.fixed.length;
  const r = PULLEY_R;
  const side = Math.min(0.7, boxSide(loadMass));

  const padTop = 6;
  const padBottom = 8;
  const s = Math.max(10, Math.min((height - padTop - padBottom) / WORLD_H, (width - 24) / (2 * r * 6 + 2.4)));
  const topY = padTop;
  const Y = (m: number) => topY + m * s;

  // World heights below the ceiling, m.
  const topCy = 0.55;
  const restCy = 3.3;
  const bottomCy = restCy - clamp01(progress) * travel;
  const groundM = 4.65;
  const handM = 3.45;

  // Pulley centres, left to right. Each sits 2r from the one before it.
  const x0 = width / 2 - n * r * s + r * s; // centre of pulley 0, px
  const cxOf = (i: number) => x0 + i * 2 * r * s;
  const anchorX = cxOf(0) - r * s;

  // The bottom block hangs from every rope that touches it.
  const bottomXs: number[] = [];
  layout.fixed.forEach((isFixed, i) => {
    if (!isFixed) bottomXs.push(cxOf(i) - r * s, cxOf(i) + r * s);
  });
  if (layout.anchoredToLoad) bottomXs.push(anchorX);
  const bottomMin = Math.min(...bottomXs);
  const bottomMax = Math.max(...bottomXs);
  const loadCx = (bottomMin + bottomMax) / 2;

  const topXs: number[] = [];
  layout.fixed.forEach((isFixed, i) => {
    if (isFixed) topXs.push(cxOf(i) - r * s, cxOf(i) + r * s);
  });
  if (!layout.anchoredToLoad) topXs.push(anchorX);
  const topMin = Math.min(...topXs);
  const topMax = Math.max(...topXs);

  // The rope, as one path from its anchor over every wheel to the hand.
  const ropePath = (() => {
    const rp = r * s;
    const anchorY = layout.anchoredToLoad ? Y(bottomCy - 0.36) : Y(topCy + 0.36);
    let d = `M ${anchorX} ${anchorY}`;
    layout.fixed.forEach((isFixed, i) => {
      const cx = cxOf(i);
      const cy = isFixed ? Y(topCy) : Y(bottomCy);
      // Over the top of a fixed wheel (clockwise), under a moving one (anticlockwise).
      d += ` L ${cx - rp} ${cy} A ${rp} ${rp} 0 0 ${isFixed ? 1 : 0} ${cx + rp} ${cy}`;
    });
    return `${d} L ${cxOf(n - 1) + rp} ${Y(handM)}`;
  })();

  // How much rope has run through, px: the hand pulls n times as far as the load rises.
  const pulledM = clamp01(progress) * travel * n;
  const pulledPx = pulledM * s;
  const spin = (pulledM / r) * (180 / Math.PI);

  const boxPx = side * s;
  const boxTop = Y(bottomCy + 0.55);
  const handX = cxOf(n - 1) + r * s;

  const maxForce = Math.max(loadForce, effort, effortRequired, 1);
  const effortLen = arrowLength(effort, maxForce);

  const wheel = (cx: number, cy: number, dir: 1 | -1, key: string) => (
    <G key={key}>
      <Circle cx={cx} cy={cy} r={r * s} fill="#222C3D" stroke={STEEL} strokeWidth={2} />
      <G transform={`rotate(${dir * spin} ${cx} ${cy})`}>
        {[0, 60, 120].map((a) => (
          <Line
            key={a}
            x1={cx - r * s * 0.78 * Math.cos((a * Math.PI) / 180)}
            y1={cy - r * s * 0.78 * Math.sin((a * Math.PI) / 180)}
            x2={cx + r * s * 0.78 * Math.cos((a * Math.PI) / 180)}
            y2={cy + r * s * 0.78 * Math.sin((a * Math.PI) / 180)}
            stroke={STEEL}
            strokeWidth={1.5}
          />
        ))}
      </G>
      <Circle cx={cx} cy={cy} r={Math.max(2, r * s * 0.18)} fill={STEEL} />
    </G>
  );

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Ceiling and ground */}
      <Rect x={0} y={0} width={width} height={Y(0.1)} fill={GROUND} />
      <Line x1={0} y1={Y(0.1)} x2={width} y2={Y(0.1)} stroke={colors.stroke} strokeWidth={2} />
      <Rect x={0} y={Y(groundM)} width={width} height={Math.max(0, height - Y(groundM))} fill={GROUND} opacity={0.55} />
      <Line x1={0} y1={Y(groundM)} x2={width} y2={Y(groundM)} stroke={colors.stroke} strokeWidth={2} />

      {/* Fixed block, hung from the ceiling */}
      {layout.fixed.map((isFixed, i) =>
        isFixed ? (
          <Line key={`ax-${i}`} x1={cxOf(i)} y1={Y(0.1)} x2={cxOf(i)} y2={Y(topCy)} stroke={STEEL} strokeWidth={3} />
        ) : null
      )}
      <Rect x={topMin - 6} y={Y(0.1)} width={topMax - topMin + 12} height={Math.max(4, 0.07 * s)} rx={2} fill={STEEL} />
      {!layout.anchoredToLoad ? (
        <Line x1={anchorX} y1={Y(0.1)} x2={anchorX} y2={Y(topCy + 0.36)} stroke={STEEL} strokeWidth={3} />
      ) : null}

      {/* The rope: a dark line underneath, with lighter dashes sliding along it */}
      <Path d={ropePath} fill="none" stroke="#6B5A3A" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d={ropePath}
        fill="none"
        stroke={ROPE}
        strokeWidth={2}
        strokeDasharray="5 7"
        strokeDashoffset={-pulledPx}
        strokeLinecap="round"
      />

      {/* Wheels */}
      {layout.fixed.map((isFixed, i) =>
        isFixed ? wheel(cxOf(i), Y(topCy), 1, `w-${i}`) : wheel(cxOf(i), Y(bottomCy), -1, `w-${i}`)
      )}

      {/* Moving block and the load hanging from it */}
      {layout.fixed.map((isFixed, i) =>
        !isFixed ? (
          <Line key={`bx-${i}`} x1={cxOf(i)} y1={Y(bottomCy)} x2={cxOf(i)} y2={Y(bottomCy + 0.34)} stroke={STEEL} strokeWidth={3} />
        ) : null
      )}
      {layout.anchoredToLoad ? (
        <Line x1={anchorX} y1={Y(bottomCy - 0.36)} x2={anchorX} y2={Y(bottomCy + 0.34)} stroke={STEEL} strokeWidth={3} />
      ) : null}
      <Rect x={bottomMin - 6} y={Y(bottomCy + 0.34)} width={bottomMax - bottomMin + 12} height={Math.max(4, 0.07 * s)} rx={2} fill={STEEL} />
      <Line x1={loadCx} y1={Y(bottomCy + 0.34)} x2={loadCx} y2={boxTop} stroke={STEEL} strokeWidth={3} />
      <LoadBox x={loadCx - boxPx / 2} y={boxTop} side={boxPx} text={labels.load} />
      <Label x={loadCx} y={boxTop + boxPx + 15} text={labels.loadForce} color={colors.amber} />

      {/* The user's pull, at the loose end of the rope */}
      <Rect x={handX - 5} y={Y(handM) - 2} width={10} height={16} rx={4} fill={enough ? colors.accent : colors.rose} opacity={0.9} />
      <EffortMark enough={enough} shakeKey={shakeKey}>
        {(color) =>
          effortLen > 0 ? (
            <G>
              <Arrow x1={handX} y1={Y(handM) + 18} x2={handX} y2={Y(handM) + 18 + Math.min(effortLen, Y(groundM) - Y(handM) - 24)} color={color} />
              <Label
                x={handX + 10}
                y={Y(handM) + 18 + Math.min(effortLen, Y(groundM) - Y(handM) - 24) / 2 + 4}
                text={labels.effortForce}
                color={color}
                anchor="start"
              />
            </G>
          ) : null
        }
      </EffortMark>
    </Svg>
  );
}
