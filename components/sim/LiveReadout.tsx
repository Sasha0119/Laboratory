import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme';

interface Props {
  t: number;
  height: number;
  x: number;
  speed: number;
  vy: number;
  /** Shown while a run is in progress so the user knows drag is doing work. */
  terminalVelocity: number;
}

/**
 * Live telemetry over the canvas. Every row is monospaced and fixed-width so
 * the digits do not jitter sideways at 60 fps.
 */
export function LiveReadout({ t, height, x, speed, vy, terminalVelocity }: Props) {
  const showTerminal = Number.isFinite(terminalVelocity) && terminalVelocity > 0;
  return (
    <View style={[styles.panel, { pointerEvents: 'none' }]}>
      <Row label="t" value={t.toFixed(2)} unit="s" />
      <Row label="h" value={fmt(height)} unit="m" accent />
      <Row label="x" value={fmt(x)} unit="m" />
      <View style={styles.divider} />
      <Row label="|v|" value={fmt(speed)} unit="m/s" accent />
      <Row label="v↕" value={(vy >= 0 ? '+' : '') + fmt(vy)} unit="m/s" />
      {showTerminal ? (
        <>
          <View style={styles.divider} />
          <Row label="v∞" value={fmt(terminalVelocity)} unit="m/s" dim />
        </>
      ) : null}
    </View>
  );
}

function Row({
  label,
  value,
  unit,
  accent,
  dim,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
  dim?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, dim && styles.dim]}>{label}</Text>
      <Text style={[styles.value, accent && styles.accent, dim && styles.dim]}>{value}</Text>
      <Text style={[styles.unit, dim && styles.dim]}>{unit}</Text>
    </View>
  );
}

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(8,11,18,0.72)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 7,
    paddingHorizontal: 9,
    gap: 2,
    minWidth: 118,
  },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  label: {
    color: colors.textFaint,
    fontSize: 10,
    width: 22,
    fontWeight: '600',
  },
  value: {
    color: colors.text,
    fontSize: 12.5,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  accent: { color: colors.accent },
  dim: { color: colors.textFaint },
  unit: { color: colors.textFaint, fontSize: 9.5, width: 30, textAlign: 'right' },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 3,
  },
});
