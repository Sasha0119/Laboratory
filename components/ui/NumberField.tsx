import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';

interface Props {
  label: string;
  /** The committed value. Typing does not change this until blur/submit. */
  value: number;
  min: number;
  max: number;
  /** Unit symbol — international, so it is never translated. */
  unit?: string;
  /** Decimal places used when the field is re-rendered from `value`. */
  decimals?: number;
  disabled?: boolean;
  /** Extra guidance under the range line. */
  hint?: string;
  onCommit: (value: number) => void;
}

/**
 * Collapse the gap an empty unit leaves behind.
 *
 * The range and clamp strings interpolate `{{unit}}`, so a unitless field
 * (bounciness, drag coefficient) would otherwise read "Min: 0  — Max: 1" with
 * a doubled space. Trimming the ends is not enough — the hole is in the middle.
 */
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

/** How long a clamp message stays on screen. */
const MESSAGE_MS = 2600;

function format(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  // Drop trailing zeros so "10.00" reads as "10", but keep "0.5" intact.
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/**
 * A typed numeric parameter.
 *
 * Replaces the sliders: the range is stated rather than discovered by dragging,
 * and an out-of-range entry is clamped on blur with a short explanation of what
 * happened, so the value silently changing never looks like a bug.
 *
 * The text is local state while the field has focus — reformatting mid-typing
 * would fight the user — and re-syncs from `value` whenever the parent changes
 * it, which is what lets the object presets fill these in.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  unit,
  decimals = 2,
  disabled = false,
  hint,
  onCommit,
}: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => format(value, decimals));
  const [focused, setFocused] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow external changes (a preset being applied, a reset) unless the user
  // is mid-edit, in which case their keystrokes win.
  useEffect(() => {
    if (!focused) setText(format(value, decimals));
  }, [value, decimals, focused]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const flash = useCallback((text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), MESSAGE_MS);
  }, []);

  const commit = useCallback(() => {
    setFocused(false);
    // Accept a comma as a decimal separator; several of the app's languages
    // use it, and a numeric keypad may well produce one.
    const parsed = Number.parseFloat(text.replace(',', '.'));

    if (!Number.isFinite(parsed)) {
      setText(format(value, decimals));
      flash(t('input.invalid'));
      return;
    }

    let next = parsed;
    if (parsed < min) {
      next = min;
      flash(tidy(t('input.clampedMin', { min: format(min, decimals), unit: unit ?? '' })));
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } else if (parsed > max) {
      next = max;
      flash(tidy(t('input.clampedMax', { max: format(max, decimals), unit: unit ?? '' })));
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }

    setText(format(next, decimals));
    if (next !== value) onCommit(next);
  }, [text, value, min, max, decimals, unit, onCommit, flash, t]);

  return (
    <View style={[styles.wrap, disabled && styles.disabled]}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
          <TextInput
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={commit}
            onSubmitEditing={commit}
            editable={!disabled}
            keyboardType="numbers-and-punctuation"
            inputMode="decimal"
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={label}
            style={styles.input}
            placeholderTextColor={colors.textFaint}
          />
          {unit ? <Text style={styles.unit}>{unit}</Text> : null}
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.range}>
          {tidy(
            t('input.range', {
              min: format(min, decimals),
              max: format(max, decimals),
              unit: unit ?? '',
            })
          )}
        </Text>
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {hint && !message ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  disabled: { opacity: 0.45 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 2,
    minWidth: 118,
  },
  inputWrapFocused: { borderColor: colors.accent },
  input: {
    flex: 1,
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
  unit: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
  metaRow: { marginTop: 5, paddingHorizontal: 2 },
  range: { color: colors.textFaint, fontSize: 11 },
  message: { color: colors.amber, fontSize: 11, marginTop: 3, paddingHorizontal: 2 },
  hint: { color: colors.textFaint, fontSize: 11, marginTop: 3, paddingHorizontal: 2 },
});
