import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from '../dom/index';
import { colors, radius } from '../../theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  tone?: string;
  disabled?: boolean;
  flex?: number;
  icon?: string;
}

/** Primary/ghost action button with a press-scale that makes clicks feel physical. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  tone = colors.accent,
  disabled = false,
  flex,
  icon,
}: Props) {
  const [pressed, setPressed] = useState(false);

  const primary = variant === 'primary';

  return (
    <View
      style={[
        { transform: `scale(${pressed ? 0.96 : 1})`, transition: 'transform 120ms ease-out' },
        flex != null && { flex },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => {
          onPress();
        }}
        style={[
          styles.base,
          primary
            ? { backgroundColor: disabled ? colors.disabled : tone }
            : { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.stroke },
          disabled && styles.disabled,
        ]}
      >
        <View style={styles.content}>
          {icon ? (
            <Text style={[styles.icon, primary ? styles.onPrimary : { color: colors.textMuted }]}>
              {icon}
            </Text>
          ) : null}
          <Text
            style={[
              styles.label,
              primary ? styles.onPrimary : { color: colors.text },
              disabled && { color: colors.textFaint },
            ]}
          >
            {label}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.55,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  onPrimary: {
    color: colors.bg,
  },
  icon: {
    fontSize: 15,
    fontWeight: '700',
  },
});
