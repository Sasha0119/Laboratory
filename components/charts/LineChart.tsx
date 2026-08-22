import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { niceStep } from '../sim/viewport';
import { colors, radius } from '../../theme';

export interface Series {
  points: { x: number; y: number }[];
  color: string;
  label: string;
}

interface Props {
  series: Series[];
  width: number;
  height: number;
  xLabel: string;
  yLabel: string;
  formatY?: (v: number) => string;
  formatX?: (v: number) => string;
  /** Draw a dashed horizontal reference (e.g. terminal velocity). */
  reference?: { value: number; label: string; color?: string } | null;
}

const PAD_LEFT = 44;
const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

/**
 * Minimal line chart over react-native-svg. Deliberately small: the app only
 * needs to plot a couple of monotonic-in-x series against time after a run.
 */
export function LineChart({
  series,
  width,
  height,
  xLabel,
  yLabel,
  formatY = (v) => v.toFixed(1),
  formatX = (v) => v.toFixed(1),
  reference,
}: Props) {
  const plotW = Math.max(width - PAD_LEFT - PAD_RIGHT, 10);
  const plotH = Math.max(height - PAD_TOP - PAD_BOTTOM, 10);

  const scales = useMemo(() => {
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    for (const s of series) {
      for (const p of s.points) {
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
        if (p.y < minY) minY = p.y;
      }
    }
    if (reference && Number.isFinite(reference.value)) {
      maxY = Math.max(maxY, reference.value);
    }
    // Never collapse to a zero-height axis.
    if (maxY - minY < 1e-9) maxY = minY + 1;
    if (maxX < 1e-9) maxX = 1;
    // Round the top of the axis up to a tick boundary so labels read cleanly.
    const yStep = niceStep(maxY - minY, 4);
    const top = Math.ceil(maxY / yStep) * yStep;
    const bottom = Math.floor(minY / yStep) * yStep;
    return {
      maxX,
      top,
      bottom,
      yStep,
      xStep: niceStep(maxX, 4),
      sx: (v: number) => PAD_LEFT + (v / maxX) * plotW,
      sy: (v: number) => PAD_TOP + (1 - (v - bottom) / (top - bottom)) * plotH,
    };
  }, [series, plotW, plotH, reference]);

  const paths = useMemo(
    () =>
      series.map((s) => {
        if (s.points.length < 2) return { line: '', area: '', color: s.color, label: s.label };
        // Thin to a sane number of vertices; 60 Hz samples over 100 s is 6000.
        const step = Math.max(1, Math.floor(s.points.length / 160));
        const kept: { x: number; y: number }[] = [];
        for (let i = 0; i < s.points.length; i += step) kept.push(s.points[i]);
        const last = s.points[s.points.length - 1];
        if (kept[kept.length - 1] !== last) kept.push(last);

        const d = kept
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scales.sx(p.x).toFixed(2)} ${scales.sy(p.y).toFixed(2)}`)
          .join(' ');
        const baseY = scales.sy(Math.max(scales.bottom, 0));
        const area = `${d} L ${scales.sx(last.x).toFixed(2)} ${baseY.toFixed(2)} L ${scales
          .sx(kept[0].x)
          .toFixed(2)} ${baseY.toFixed(2)} Z`;
        return { line: d, area, color: s.color, label: s.label };
      }),
    [series, scales]
  );

  const yTicks: number[] = [];
  for (let v = scales.bottom; v <= scales.top + 1e-9; v += scales.yStep) yTicks.push(v);
  const xTicks: number[] = [];
  for (let v = 0; v <= scales.maxX + 1e-9; v += scales.xStep) xTicks.push(v);

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          {paths.map((p, i) => (
            <LinearGradient key={i} id={`fill${i}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={p.color} stopOpacity="0.28" />
              <Stop offset="1" stopColor={p.color} stopOpacity="0" />
            </LinearGradient>
          ))}
        </Defs>

        {/* Grid */}
        {yTicks.map((v, i) => (
          <G key={`y${i}`}>
            <Line
              x1={PAD_LEFT}
              y1={scales.sy(v)}
              x2={PAD_LEFT + plotW}
              y2={scales.sy(v)}
              stroke={colors.stroke}
              strokeWidth={1}
              opacity={v === 0 ? 0.75 : 0.4}
            />
            <SvgText
              x={PAD_LEFT - 6}
              y={scales.sy(v) + 3.5}
              fill={colors.textFaint}
              fontSize={9}
              textAnchor="end"
            >
              {formatY(v)}
            </SvgText>
          </G>
        ))}
        {xTicks.map((v, i) => (
          <G key={`x${i}`}>
            <Line
              x1={scales.sx(v)}
              y1={PAD_TOP}
              x2={scales.sx(v)}
              y2={PAD_TOP + plotH}
              stroke={colors.stroke}
              strokeWidth={1}
              opacity={0.22}
            />
            <SvgText
              x={scales.sx(v)}
              y={PAD_TOP + plotH + 13}
              fill={colors.textFaint}
              fontSize={9}
              textAnchor="middle"
            >
              {formatX(v)}
            </SvgText>
          </G>
        ))}

        {reference && Number.isFinite(reference.value) ? (
          <G>
            <Line
              x1={PAD_LEFT}
              y1={scales.sy(reference.value)}
              x2={PAD_LEFT + plotW}
              y2={scales.sy(reference.value)}
              stroke={reference.color ?? colors.amber}
              strokeWidth={1.2}
              strokeDasharray="4 4"
              opacity={0.8}
            />
            <SvgText
              x={PAD_LEFT + plotW - 3}
              y={scales.sy(reference.value) - 5}
              fill={reference.color ?? colors.amber}
              fontSize={9}
              textAnchor="end"
            >
              {reference.label}
            </SvgText>
          </G>
        ) : null}

        {paths.map((p, i) =>
          p.line ? (
            <G key={`p${i}`}>
              <Path d={p.area} fill={`url(#fill${i})`} />
              <Path
                d={p.line}
                stroke={p.color}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </G>
          ) : null
        )}

        <SvgText x={PAD_LEFT + plotW} y={height - 2} fill={colors.textFaint} fontSize={9} textAnchor="end">
          {xLabel}
        </SvgText>
      </Svg>

      <View style={styles.legend}>
        <Text style={styles.axis}>{yLabel}</Text>
        <View style={styles.keys}>
          {series.map((s) => (
            <View key={s.label} style={styles.key}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={styles.keyText}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  axis: { color: colors.textFaint, fontSize: 10.5, fontWeight: '600' },
  keys: { flexDirection: 'row', gap: 12 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  keyText: { color: colors.textMuted, fontSize: 10.5 },
});
