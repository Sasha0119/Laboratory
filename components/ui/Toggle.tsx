import { Pressable, StyleSheet, Text, View } from '../dom/index';
import { colors, radius, spacing } from '../../theme';

interface Props {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

const TRACK_W = 50;
const TRACK_H = 30;
const KNOB = 24;

/** Labelled switch row. Custom-drawn so the knob can pick up the accent glow. */
export function Toggle({ label, description, value, disabled = false, onChange }: Props) {
  return (
    <Pressable
      style={[styles.row, disabled && styles.disabled]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      onPress={() => {
        if (disabled) return;
        onChange(!value);
      }}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <View
        style={[
          styles.track,
          {
            backgroundColor: value ? colors.accentDim : colors.surfaceAlt,
            borderColor: value ? colors.accent : colors.stroke,
            transition: 'background-color 180ms ease, border-color 180ms ease',
          },
        ]}
      >
        <View
          style={[
            styles.knob,
            {
              backgroundColor: value ? colors.accent : colors.textFaint,
              transform: `translateX(${value ? TRACK_W - KNOB - 5 : 0}px)`,
              transition: 'transform 180ms cubic-bezier(0.3, 1.4, 0.5, 1), background-color 180ms ease',
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  disabled: {
    opacity: 0.42,
  },
  text: {
    flex: 1,
    paddingRight: spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 2,
  },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 2,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: radius.pill,
  },
});
