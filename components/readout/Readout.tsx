import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useDetailMode } from '../../context/DetailMode';
import { friendly } from '../../lib/format';
import { colors, radius, spacing } from '../../theme';
import { Card } from '../ui/Card';
import { Toggle } from '../ui/Toggle';

/**
 * The standard live readout for every simulation module.
 *
 * Two or three big rounded numbers in plain language, each with an optional
 * bar and a rise/fall arrow so a change is visible without reading the digits
 * at all. Everything technical is collapsed behind one shared toggle.
 *
 * New modules should render this rather than inventing their own panel, so
 * the reading experience stays identical across the app.
 */

export interface Stat {
  key: string;
  /** Plain language — "Speed", not "v". */
  label: string;
  /** The real value. Rounding happens here, never upstream. */
  value: number;
  unit?: string;
  /** 0..1 bar fill. Omit for no bar. */
  fill?: number;
  /** One short everyday comparison, e.g. "like a car in town". */
  caption?: string;
  tone?: string;
  /** Draw an arrow when the value is climbing or falling. */
  showTrend?: boolean;
  /** Override the default rounding (used for time). */
  format?: (v: number) => string;
}

export interface DetailRow {
  label: string;
  value: string;
  unit?: string;
}

interface Props {
  stats: Stat[];
  /** Raw figures, shown only when detailed mode is on. */
  details?: DetailRow[];
  /** Sentence shown under the tiles, e.g. the outcome of a collision. */
  message?: string | null;
  messageTone?: string;
  /** Hide the toggle when a screen shows more than one Readout. */
  showToggle?: boolean;
  title?: string;
}

export function Readout({
  stats,
  details,
  message,
  messageTone,
  showToggle = true,
  title,
}: Props) {
  const { t } = useTranslation();
  const { detailed, setDetailed } = useDetailMode();

  return (
    <Card title={title} style={styles.card}>
      <View style={styles.row}>
        {stats.map((s) => (
          <StatTile key={s.key} stat={s} />
        ))}
      </View>

      {message ? (
        <View style={[styles.message, messageTone ? { borderLeftColor: messageTone } : null]}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}

      {showToggle ? (
        <View style={styles.toggleWrap}>
          <Toggle
            label={t('readout.detailToggle')}
            description={t('readout.detailDescription')}
            value={detailed}
            onChange={setDetailed}
          />
        </View>
      ) : null}

      {detailed && details && details.length > 0 ? (
        <View style={styles.details}>
          {details.map((d) => (
            <View key={d.label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{d.label}</Text>
              <Text style={styles.detailValue}>
                {d.value}
                {d.unit ? <Text style={styles.detailUnit}> {d.unit}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * One number. The arrow compares against the previous render, with a deadband
 * so a value hovering at its peak does not flicker between up and down.
 */
function StatTile({ stat }: { stat: Stat }) {
  const previous = useRef(stat.value);
  const [trend, setTrend] = useState(0);

  useEffect(() => {
    if (!stat.showTrend) return;
    const delta = stat.value - previous.current;
    const scale = Math.max(Math.abs(stat.value), 1);
    // Ignore changes under 0.5% of the current magnitude.
    if (Math.abs(delta) > scale * 0.005) {
      setTrend(delta > 0 ? 1 : -1);
      previous.current = stat.value;
    }
  }, [stat.value, stat.showTrend]);

  const tone = stat.tone ?? colors.accent;
  const text = (stat.format ?? friendly)(stat.value);
  const fill = stat.fill == null ? null : Math.min(1, Math.max(0, stat.fill));

  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {stat.label}
      </Text>

      <View style={styles.valueRow}>
        <Text style={[styles.tileValue, { color: tone }]} numberOfLines={1}>
          {text}
        </Text>
        {stat.unit ? <Text style={styles.tileUnit}>{stat.unit}</Text> : null}
        {/* An arrow next to a stopped object would be meaningless, so the
            trend is hidden once the value reaches zero. */}
        {stat.showTrend && trend !== 0 && Math.abs(stat.value) > 1e-3 ? (
          <Text style={[styles.trend, { color: trend > 0 ? tone : colors.textFaint }]}>
            {trend > 0 ? '▲' : '▼'}
          </Text>
        ) : null}
      </View>

      {fill != null ? (
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${fill * 100}%`, backgroundColor: tone }]} />
        </View>
      ) : null}

      {stat.caption ? (
        <Text style={styles.caption} numberOfLines={2}>
          {stat.caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },

  tile: { flex: 1, minWidth: 0 },
  tileLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  tileValue: {
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  tileUnit: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
  trend: { fontSize: 11, marginLeft: 1 },

  barTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    marginTop: 7,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.pill },

  caption: {
    color: colors.textFaint,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 6,
  },

  message: {
    marginTop: spacing.md,
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
  },
  messageText: { color: colors.text, fontSize: 13, lineHeight: 19 },

  toggleWrap: {
    marginTop: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.strokeSoft,
  },
  details: {
    marginTop: spacing.xs,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 5,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  detailLabel: { color: colors.textMuted, fontSize: 11.5 },
  detailValue: {
    color: colors.text,
    fontSize: 11.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  detailUnit: { color: colors.textFaint, fontWeight: '400' },
});
