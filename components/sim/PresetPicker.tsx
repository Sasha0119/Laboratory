import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from '../dom/index';
import Svg from '../dom/svg';
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
      contentContainerStyle={styles.row}
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
  const [pressed, setPressed] = useState(false);

  return (
    <View
      style={{
        transform: `scale(${pressed ? 0.94 : 1})`,
        transition: 'transform 120ms ease-out',
      }}
    >
      <Pressable
        disabled={disabled}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => {
          if (active) return;
          onPress();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled }}
      >
        <View
          style={[
            styles.chip,
            disabled && { opacity: 0.5 },
            {
              backgroundColor: active ? colors.surfaceAlt : colors.bgElevated,
              borderColor: active ? colors.accent : colors.strokeSoft,
              transition: 'background-color 180ms ease, border-color 180ms ease',
            },
          ]}
        >
          <View
            style={{
              transform: `scale(${active ? 1.06 : 0.88})`,
              opacity: active ? 1 : 0.62,
              transition: 'transform 180ms ease, opacity 180ms ease',
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
          </View>
          <Text
            style={[
              styles.label,
              { color: active ? colors.accent : colors.textMuted, transition: 'color 180ms ease' },
            ]}
          >
            {t(`presets.${preset.id}.label`)}
          </Text>
        </View>
      </Pressable>
    </View>
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

