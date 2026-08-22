import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SimResult } from '../../lib/physics/simulation';
import { colors, radius, spacing } from '../../theme';
import { LineChart } from '../charts/LineChart';
import { Card } from '../ui/Card';
import { Segmented } from '../ui/Segmented';

interface Props {
  result: SimResult;
  /** Release height, used to say whether the object actually rose. */
  dropHeight: number;
  chartWidth: number;
  airResistance: boolean;
}

type Plot = 'speed' | 'height' | 'path';

const OUTCOME_TEXT: Record<SimResult['outcome'], { title: string; tone: string }> = {
  landed: { title: 'Impact', tone: colors.accent },
  boundary: { title: 'Reached the chamber wall', tone: colors.blue },
  timeout: { title: 'Still falling at the time limit', tone: colors.amber },
  floating: { title: 'No net force — it just floats', tone: colors.violet },
};

export function ResultPanel({ result, dropHeight, chartWidth, airResistance }: Props) {
  const [plot, setPlot] = useState<Plot>('speed');
  const outcome = OUTCOME_TEXT[result.outcome];

  const showTerminal =
    airResistance && Number.isFinite(result.terminalVelocity) && result.terminalVelocity > 0;

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <View style={[styles.dot, { backgroundColor: outcome.tone }]} />
          <Text style={[styles.outcome, { color: outcome.tone }]}>{outcome.title}</Text>
        </View>

        <View style={styles.grid}>
          <Stat label="Time elapsed" value={result.totalTime.toFixed(3)} unit="s" big />
          <Stat
            label="Impact speed"
            value={fmt(result.impactSpeed)}
            unit="m/s"
            big
            tone={colors.accent}
          />
          <Stat
            label={result.rose ? 'Max height' : 'Release height'}
            value={fmt(result.maxHeight)}
            unit="m"
          />
          <Stat label="Distance" value={fmt(result.distance)} unit="m" />
          <Stat label="Impact energy" value={fmtEnergy(result.impactEnergy)} unit="J" />
          <Stat
            label="Terminal velocity"
            value={showTerminal ? fmt(result.terminalVelocity) : '—'}
            unit={showTerminal ? 'm/s' : ''}
            hint={showTerminal ? undefined : 'no air'}
          />
        </View>

        {result.rose ? (
          <Text style={styles.note}>
            Rose {fmt(result.maxHeight - dropHeight)} m above the release point before falling
            back.
          </Text>
        ) : null}
        {showTerminal && result.impactSpeed > result.terminalVelocity * 0.98 ? (
          <Text style={styles.note}>
            It reached terminal velocity on the way down — drag exactly cancelled its weight,
            so it stopped accelerating.
          </Text>
        ) : null}
        {result.outcome === 'timeout' ? (
          <Text style={styles.note}>
            The run hit the time limit before landing. Try a smaller drop height, or turn air
            resistance off.
          </Text>
        ) : null}
      </Card>

      <Card title="Graphs" style={styles.card}>
        <View style={styles.plotPicker}>
          <Segmented<Plot>
            compact
            options={[
              { value: 'speed', label: 'Speed' },
              { value: 'height', label: 'Height' },
              { value: 'path', label: 'Path' },
            ]}
            value={plot}
            onChange={setPlot}
          />
        </View>

        {plot === 'speed' ? (
          <LineChart
            width={chartWidth}
            height={168}
            xLabel="time (s)"
            yLabel="Speed vs time"
            formatY={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            formatX={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            reference={
              showTerminal
                ? { value: result.terminalVelocity, label: 'terminal', color: colors.amber }
                : null
            }
            series={[
              {
                label: 'speed',
                color: colors.accent,
                points: result.samples.map((s) => ({ x: s.t, y: s.speed })),
              },
            ]}
          />
        ) : null}

        {plot === 'height' ? (
          <LineChart
            width={chartWidth}
            height={168}
            xLabel="time (s)"
            yLabel="Height vs time"
            formatY={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            formatX={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            series={[
              {
                label: 'height',
                color: colors.blue,
                points: result.samples.map((s) => ({ x: s.t, y: s.y })),
              },
            ]}
          />
        ) : null}

        {plot === 'path' ? (
          <LineChart
            width={chartWidth}
            height={168}
            xLabel="distance (m)"
            yLabel="Height vs distance"
            formatY={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            formatX={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            series={[
              {
                label: 'trajectory',
                color: colors.violet,
                points: result.samples.map((s) => ({ x: s.x, y: s.y })),
              },
            ]}
          />
        ) : null}
      </Card>
    </>
  );
}

function Stat({
  label,
  value,
  unit,
  big,
  tone,
  hint,
}: {
  label: string;
  value: string;
  unit: string;
  big?: boolean;
  tone?: string;
  hint?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, big && styles.statValueBig, tone ? { color: tone } : null]}>
          {value}
        </Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

function fmtEnergy(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.001) return v.toFixed(4);
  return v.toExponential(1);
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: spacing.md },
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  outcome: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  stat: { width: '50%', paddingRight: spacing.sm },
  statLabel: {
    color: colors.textFaint,
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  statValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statValueBig: { fontSize: 22 },
  statUnit: { color: colors.textFaint, fontSize: 11 },
  statHint: { color: colors.textFaint, fontSize: 10, marginTop: 1 },

  note: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.strokeSoft,
  },

  plotPicker: { marginBottom: spacing.md },
});
