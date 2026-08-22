import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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

/** Primary/ghost action button with a press-scale that makes taps feel physical. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  tone = colors.accent,
  disabled = false,
  flex,
  icon,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();

  const primary = variant === 'primary';

  return (
    <Animated.View style={[{ transform: [{ scale }] }, flex != null && { flex }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={() => spring(0.96)}
        onPressOut={() => spring(1)}
        onPress={() => {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(
              primary ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
            ).catch(() => {});
          }
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
    </Animated.View>
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
