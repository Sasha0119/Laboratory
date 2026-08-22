import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg from 'react-native-svg';
import { PRESETS, type ObjectPreset } from '../../lib/physics/presets';
import { colors, radius, spacing } from '../../theme';
import { ObjectGlyph } from './ObjectGlyph';

interface Props {
  value: string;
  onChange: (preset: ObjectPreset) => void;
  disabled?: boolean;
}

export function PresetPicker({ value, onChange, disabled = false }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      scrollEnabled={!disabled}
    >
      {PRESETS.map((preset) => (
        <Chip
          key={preset.id}
          preset={preset}
          active={preset.id === value}
          disabled={disabled}
          onPress={() => onChange(preset)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  preset,
  active,
  disabled,
  onPress,
}: {
  preset: ObjectPreset;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const anim = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: active ? 1 : 0,
      useNativeDriver: false, // colours are interpolated, which the native driver cannot do
      speed: 16,
      bounciness: 7,
    }).start();
  }, [active, anim]);

  return (
    <Animated.View style={{ transform: [{ scale: press }] }}>
      <Pressable
        disabled={disabled}
        onPressIn={() =>
          Animated.spring(press, { toValue: 0.94, useNativeDriver: true, speed: 45 }).start()
        }
        onPressOut={() =>
          Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 45 }).start()
        }
        onPress={() => {
          if (active) return;
          if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled }}
      >
        <Animated.View
          style={[
            styles.chip,
            disabled && { opacity: 0.5 },
            {
              backgroundColor: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [colors.bgElevated, colors.surfaceAlt],
              }),
              borderColor: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [colors.strokeSoft, colors.accent],
              }),
            },
          ]}
        >
          <Animated.View
            style={{
              transform: [
                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.06] }) },
              ],
              opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }),
            }}
          >
            <Svg width={38} height={38} viewBox="-19 -19 38 38">
              <ObjectGlyph
                shape={preset.shape}
                r={13}
                material={preset.material}
                idPrefix={`chip-${preset.id}`}
              />
            </Svg>
          </Animated.View>
          <Animated.Text
            style={[
              styles.label,
              {
                color: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [colors.textMuted, colors.accent],
                }),
              },
            ]}
          >
            {t(`presets.${preset.id}.label`)}
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2, paddingRight: spacing.md },
  chip: {
    width: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.4,
  },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
});

