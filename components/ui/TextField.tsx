import { forwardRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing } from '../../theme';

interface Props extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Shown in amber under the field. Inline, never as a popup. */
  error?: string | null;
  /** Quiet guidance under the field, hidden while an error is showing. */
  hint?: string | null;
  /** Adds the show/hide control and starts obscured. */
  secure?: boolean;
  /** Label for the reveal control, translated by the caller. */
  showLabel?: string;
  hideLabel?: string;
}

/**
 * A labelled text input for the auth forms.
 *
 * Stacked rather than side-by-side like `NumberField`, because an email address
 * needs the whole width, and because these fields carry validation text that
 * has to sit directly beneath what it is talking about.
 */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, hint, secure = false, showLabel, hideLabel, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.inputWrap,
          focused && styles.inputWrapFocused,
          !!error && styles.inputWrapError,
        ]}
      >
        <TextInput
          ref={ref}
          {...rest}
          secureTextEntry={secure && !revealed}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          accessibilityLabel={label}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />

        {secure && showLabel && hideLabel ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? hideLabel : showLabel}
            hitSlop={8}
          >
            <Text style={styles.reveal}>{revealed ? hideLabel : showLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 4,
  },
  inputWrapFocused: { borderColor: colors.accent },
  inputWrapError: { borderColor: colors.amber },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
  },
  reveal: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  error: { color: colors.amber, fontSize: 12, lineHeight: 17, marginTop: 6, paddingHorizontal: 2 },
  hint: { color: colors.textFaint, fontSize: 11.5, lineHeight: 16, marginTop: 6, paddingHorizontal: 2 },
});
