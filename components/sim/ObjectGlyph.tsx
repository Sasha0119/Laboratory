import {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import type { MaterialId, ShapeId } from '../../lib/physics/presets';

interface Props {
  shape: ShapeId;
  /** Half-height of the drawn object, in pixels. */
  r: number;
  material: MaterialId;
  /** Gradient ids must be unique per instance on the same SVG surface. */
  idPrefix: string;
  opacity?: number;
}

/** Body / highlight / shade for each material. */
const PALETTE: Record<MaterialId, { base: string; light: string; dark: string; edge: string }> = {
  rubber: { base: '#E8663C', light: '#FFC49A', dark: '#7A2A12', edge: '#3A1409' },
  glass: { base: '#7FD9F5', light: '#FFFFFF', dark: '#1A6A8E', edge: '#0C3A50' },
  paper: { base: '#D8C9A8', light: '#F6EEDC', dark: '#6E5F42', edge: '#3C3222' },
  soft: { base: '#E8EEF7', light: '#FFFFFF', dark: '#8FA3BE', edge: '#5C6B82' },
};

/**
 * The object itself, drawn centred on (0, 0) so the caller can position and
 * transform it freely. Every shape gets a light source from the upper left,
 * which is what stops a flat-filled circle from reading as programmer art.
 */
export function ObjectGlyph({ shape, r, material, idPrefix, opacity = 1 }: Props) {
  const c = PALETTE[material];
  const bodyId = `${idPrefix}-body`;
  const sheenId = `${idPrefix}-sheen`;

  const defs = (
    <Defs>
      <RadialGradient id={bodyId} cx="34%" cy="28%" r="78%">
        <Stop offset="0" stopColor={c.light} />
        <Stop offset="0.42" stopColor={c.base} />
        <Stop offset="1" stopColor={c.dark} />
      </RadialGradient>
      <LinearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={c.light} stopOpacity="0.85" />
        <Stop offset="1" stopColor={c.base} stopOpacity="0" />
      </LinearGradient>
    </Defs>
  );

  if (shape === 'circle') {
    return (
      <G opacity={opacity}>
        {defs}
        <Circle r={r} fill={`url(#${bodyId})`} stroke={c.edge} strokeWidth={Math.max(0.6, r * 0.05)} />
        {/* Specular dot: small, offset, and much brighter than the body. */}
        <Ellipse
          cx={-r * 0.32}
          cy={-r * 0.38}
          rx={r * 0.26}
          ry={r * 0.18}
          fill={c.light}
          opacity={0.75}
          transform={`rotate(-28 ${-r * 0.32} ${-r * 0.38})`}
        />
      </G>
    );
  }

  if (shape === 'disc') {
    return (
      <G opacity={opacity}>
        {defs}
        {/* Seen nearly edge-on, so the disc is a squashed ellipse with a rim. */}
        <Ellipse ry={r * 0.34} rx={r} fill={`url(#${bodyId})`} stroke={c.edge} strokeWidth={0.8} />
        <Ellipse
          cy={-r * 0.1}
          ry={r * 0.16}
          rx={r * 0.7}
          fill={`url(#${sheenId})`}
          opacity={0.6}
        />
      </G>
    );
  }

  if (shape === 'square') {
    const s = r * 0.92;
    return (
      <G opacity={opacity}>
        {defs}
        <Rect
          x={-s}
          y={-s * 0.72}
          width={s * 2}
          height={s * 1.44}
          rx={Math.max(1, s * 0.1)}
          fill={`url(#${bodyId})`}
          stroke={c.edge}
          strokeWidth={Math.max(0.6, s * 0.05)}
        />
        {/* Spine down the left edge and a hint of page block on the right. */}
        <Rect
          x={-s}
          y={-s * 0.72}
          width={s * 0.3}
          height={s * 1.44}
          rx={Math.max(1, s * 0.1)}
          fill={c.dark}
          opacity={0.75}
        />
        {[0.28, 0.5, 0.72].map((f, i) => (
          <Line
            key={i}
            x1={-s * 0.55}
            y1={-s * 0.72 + s * 1.44 * f}
            x2={s * 0.82}
            y2={-s * 0.72 + s * 1.44 * f}
            stroke={c.light}
            strokeWidth={Math.max(0.4, s * 0.035)}
            opacity={0.28}
          />
        ))}
      </G>
    );
  }

  // Feather: a vane either side of a central rachis, tapering to the quill.
  const w = r * 0.62;
  const h = r;
  const vane = `M 0 ${-h}
     C ${w} ${-h * 0.55}, ${w * 0.92} ${h * 0.28}, 0 ${h * 0.72}
     C ${-w * 0.92} ${h * 0.28}, ${-w} ${-h * 0.55}, 0 ${-h} Z`;
  return (
    <G opacity={opacity}>
      <Defs>
        <LinearGradient id={bodyId} x1="0" y1="0" x2="1" y2="0.6">
          <Stop offset="0" stopColor={c.light} />
          <Stop offset="0.55" stopColor={c.base} />
          <Stop offset="1" stopColor={c.dark} />
        </LinearGradient>
      </Defs>
      <Path d={vane} fill={`url(#${bodyId})`} stroke={c.edge} strokeWidth={0.5} opacity={0.95} />
      {/* Barbs, as short strokes off the shaft. */}
      {[-0.6, -0.32, -0.04, 0.24, 0.5].map((f, i) => (
        <Line
          key={i}
          x1={0}
          y1={h * f}
          x2={w * 0.78 * (1 - Math.abs(f) * 0.5)}
          y2={h * f - h * 0.16}
          stroke={c.dark}
          strokeWidth={0.5}
          opacity={0.35}
        />
      ))}
      <Line x1={0} y1={-h} x2={0} y2={h} stroke={c.edge} strokeWidth={Math.max(0.6, r * 0.045)} />
    </G>
  );
}

export const MATERIAL_COLORS = PALETTE;
