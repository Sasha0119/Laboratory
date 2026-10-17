import { StyleSheet, Text, View } from '../dom/index';
import { colors, radius, spacing } from '../../theme';
import { Card } from '../ui/Card';

export interface EffortBar {
  key: string;
  label: string;
  /** N */
  value: number;
  tone: string;
}

interface Props {
  title: string;
  bars: EffortBar[];
  /** The user's own effort, N: drawn as a marker across the bars. */
  effort: number;
  /** "Your effort: 60 N" */
  effortLabel: string;
  /** Whether that effort is enough for the machine; the marker turns rose if not. */
  enough: boolean;
  /** Bumped each time the effort falls short, so the marker shakes again. */
  shakeKey: number;
  /** "65.4 N" */
  formatValue: (v: number) => string;
}

/**
 * "How hard do I have to push?" as bars: lifting by hand against using the
 * machine, with the user's own effort drawn as a line across both. The gap
 * between the bars is the whole benefit of the machine, and the line shows at a
 * glance whether the user's effort reaches the bar it needs to.
 */
export function EffortBars({ title, bars, effort, effortLabel, enough, shakeKey, formatValue }: Props) {
  const scale = Math.max(1, effort, ...bars.map((b) => b.value)) * 1.08;
  const markerColor = enough ? colors.accent : colors.rose;
  const markerAt = Math.min(100, (effort / scale) * 100);

  return (
    <Card title={title}>
      <div style={{ position: 'relative' }}>
        <View style={styles.rows}>
          {bars.map((bar) => (
            <View key={bar.key}>
              <View style={styles.labelRow}>
                <Text style={styles.label} numberOfLines={2}>
                  {bar.label}
                </Text>
                <Text style={[styles.value, { color: bar.tone }]}>{formatValue(bar.value)}</Text>
              </View>
              <View style={styles.track}>
                <div
                  style={{
                    width: `${Math.max(1.5, (bar.value / scale) * 100)}%`,
                    height: '100%',
                    borderRadius: radius.pill,
                    background: bar.tone,
                    transition: 'width 300ms ease-out',
                  }}
                />
              </View>
            </View>
          ))}
        </View>

        {/* The user's effort, as a line across every bar */}
        {effort > 0 ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${markerAt}%`,
              width: 0,
              borderLeft: `2px dashed ${markerColor}`,
              transition: 'left 200ms ease-out',
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </div>

      <div
        key={shakeKey}
        className={!enough && shakeKey > 0 ? 'machine-shake' : undefined}
        style={{ marginTop: spacing.sm, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 14,
            borderTop: `2px dashed ${markerColor}`,
          }}
        />
        <span style={{ color: markerColor, fontSize: 12.5, fontWeight: 700 }}>{effortLabel}</span>
      </div>
    </Card>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.md },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 5,
  },
  label: { color: colors.textMuted, fontSize: 12.5, flex: 1 },
  value: { fontSize: 14, fontWeight: '800', fontVariantNumeric: 'tabular-nums' },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
});
