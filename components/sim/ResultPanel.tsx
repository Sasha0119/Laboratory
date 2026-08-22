import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SimResult } from '../../lib/physics/simulation';
import { colors, radius, spacing } from '../../theme';
import { useDetailMode } from '../../context/DetailMode';
import { friendly, friendlyTime, precise } from '../../lib/format';
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
  const { detailed } = useDetailMode();
  // Plain wording by default; the symbols only appear in detailed mode.
  const label = (plain: string, technical: string) => (detailed ? technical : plain);

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
          <Stat
            label={label('Time taken', 'Time  t')}
            value={detailed ? precise(result.totalTime, 4) : friendlyTime(result.totalTime)}
            unit="s"
            big
          />
          <Stat
            label={label('Speed at landing', 'Impact  |v|')}
            value={detailed ? precise(result.impactSpeed, 4) : friendly(result.impactSpeed)}
            unit="m/s"
            big
            tone={colors.accent}
          />
          <Stat
            label={
              result.rose ? label('Highest point', 'Max height') : label('Dropped from', 'y₀')
            }
            value={detailed ? precise(result.maxHeight, 3) : friendly(result.maxHeight)}
            unit="m"
          />
          <Stat
            label={label('Sideways travel', 'Range  x')}
            value={detailed ? precise(result.distance, 3) : friendly(result.distance)}
            unit="m"
          />
          <Stat
            label={label('Force of landing', 'Impact energy')}
            value={detailed ? precise(result.impactEnergy, 4) : fmtEnergy(result.impactEnergy)}
            unit="J"
          />
          <Stat
            label={label('Fastest the air allows', 'Terminal  v∞')}
            value={
              showTerminal
                ? detailed
                  ? precise(result.terminalVelocity, 3)
                  : friendly(result.terminalVelocity)
                : '—'
            }
            unit={showTerminal ? 'm/s' : ''}
            hint={showTerminal ? undefined : 'no air to slow it'}
          />
        </View>

        {result.rose ? (
          <Text style={styles.note}>
            It rose {friendly(result.maxHeight - dropHeight)} m above where it started before
            falling back down.
          </Text>
        ) : null}
        {showTerminal && result.impactSpeed > result.terminalVelocity * 0.98 ? (
          <Text style={styles.note}>
            It stopped speeding up on the way down: air resistance grew until it exactly
            balanced the object's weight.
          </Text>
        ) : null}
        {result.outcome === 'timeout' ? (
          <Text style={styles.note}>
            It was still falling when the timer ran out. Try a smaller drop height, or turn
            air resistance off.
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
            xLabel={label('seconds', 'time  t (s)')}
            yLabel={label('How fast it was going', 'Speed  |v| (m/s) vs t')}
            formatY={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            formatX={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            reference={
              showTerminal
                ? {
                    value: result.terminalVelocity,
                    label: detailed ? 'v∞' : 'fastest possible',
                    color: colors.amber,
                  }
                : null
            }
            series={[
              {
                label: detailed ? '|v|' : 'speed',
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
            xLabel={label('seconds', 'time  t (s)')}
            yLabel={label('How high it was', 'Height  y (m) vs t')}
            formatY={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            formatX={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            series={[
              {
                label: detailed ? 'y' : 'height',
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
            xLabel={label('metres sideways', 'x (m)')}
            yLabel={label('The path it took', 'y (m) vs x (m)')}
            formatY={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            formatX={(v) => v.toFixed(v >= 10 ? 0 : 1)}
            series={[
              {
                label: detailed ? 'y vs x' : 'path',
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
