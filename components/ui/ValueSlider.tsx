import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useCallback, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Decimal places in the readout. */
  precision?: number;
  disabled?: boolean;
  /**
   * Map the slider's linear 0..1 travel onto the value range logarithmically.
   * Needed for mass, which spans 0.001 kg to 50 kg — five orders of magnitude
   * that a linear slider would make unusable at the light end.
   */
  logarithmic?: boolean;
  /** Extra hint under the label, e.g. why a control is inactive. */
  hint?: string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ValueSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  precision = 2,
  disabled = false,
  logarithmic = false,
  hint,
  onChange,
  onCommit,
}: Props) {
  // Haptics fire on crossing detents rather than on every pixel of travel,
  // which would buzz continuously and drain the taptic engine.
  const lastTick = useRef(0);

  const toSlider = useCallback(
    (v: number) => {
      if (!logarithmic) return v;
      const lv = Math.log(clamp(v, min, max));
      return (lv - Math.log(min)) / (Math.log(max) - Math.log(min));
    },
    [logarithmic, min, max]
  );

  const fromSlider = useCallback(
    (s: number) => {
      if (!logarithmic) return s;
      return Math.exp(Math.log(min) + s * (Math.log(max) - Math.log(min)));
    },
    [logarithmic, min, max]
  );

  const handleChange = useCallback(
    (raw: number) => {
      const next = fromSlider(raw);
      const tick = Math.round(toSlider(next) * 40);
      if (tick !== lastTick.current) {
        lastTick.current = tick;
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      }
      onChange(next);
    },
    [fromSlider, toSlider, onChange]
  );

  const display = formatValue(value, precision);

  return (
    <View style={[styles.wrap, disabled && styles.wrapDisabled]}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.readout}>
          <Text style={[styles.value, disabled && styles.valueDisabled]}>{display}</Text>
          {unit ? <Text style={styles.unit}>{unit}</Text> : null}
        </View>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={logarithmic ? 0 : min}
        maximumValue={logarithmic ? 1 : max}
        step={logarithmic ? 0 : (step ?? 0)}
        value={toSlider(value)}
        onValueChange={handleChange}
        onSlidingComplete={(raw) => onCommit?.(fromSlider(raw))}
        disabled={disabled}
        minimumTrackTintColor={disabled ? colors.disabled : colors.accent}
        maximumTrackTintColor={colors.surfaceAlt}
        thumbTintColor={disabled ? colors.textFaint : colors.accent}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Keeps small numbers readable without printing 0.00 for a feather. */
function formatValue(v: number, precision: number): string {
  const abs = Math.abs(v);
  if (abs !== 0 && abs < 0.01) return v.toFixed(4);
  if (abs !== 0 && abs < 0.1) return v.toFixed(3);
  return v.toFixed(precision);
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
  },
  wrapDisabled: {
    opacity: 0.42,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 3,
    minWidth: 86,
    justifyContent: 'flex-end',
  },
  value: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  valueDisabled: {
    color: colors.textFaint,
  },
  unit: {
    color: colors.textFaint,
    fontSize: 11,
    marginLeft: 3,
  },
  slider: {
    width: '100%',
    height: 34,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: -2,
    paddingHorizontal: 2,
  },
});
