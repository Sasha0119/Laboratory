import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from '../dom/index';
import { colors, radius } from '../../theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Tinted highlight, so the environment picker can carry that world's colour. */
  tint?: string;
  compact?: boolean;
  /** Locked while a simulation is mid-run, like the sliders. */
  disabled?: boolean;
}

const PAD = 4;
const PAD_COMPACT = 3;

/**
 * Segmented control with a sliding highlight. Only a translation is animated,
 * so it stays smooth alongside the simulation loop.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tint = colors.accent,
  compact = false,
  disabled = false,
}: Props<T>) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const [trackWidth, setTrackWidth] = useState(0);

  const pad = compact ? PAD_COMPACT : PAD;
  const segmentWidth = trackWidth > 0 ? (trackWidth - pad * 2) / options.length : 0;

  return (
    <View
      style={[styles.track, compact && styles.trackCompact, disabled && styles.disabled]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <View
          style={[
            styles.indicator,
            compact && styles.indicatorCompact,
            {
              width: segmentWidth,
              backgroundColor: tint + '22',
              borderColor: tint + '66',
              transform: `translateX(${index * segmentWidth}px)`,
              transition: 'transform 200ms cubic-bezier(0.3, 1.2, 0.5, 1)',
            },
          ]}
        />
      ) : null}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={styles.segment}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => {
              if (active || disabled) return;
              onChange(opt.value);
            }}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                compact && styles.labelCompact,
                active && { color: tint, fontWeight: '700' },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: PAD,
    position: 'relative',
  },
  disabled: { opacity: 0.45 },
  trackCompact: {
    padding: PAD_COMPACT,
    borderRadius: radius.sm,
  },
  indicator: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    bottom: PAD,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  indicatorCompact: {
    left: PAD_COMPACT,
    top: PAD_COMPACT,
    bottom: PAD_COMPACT,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  labelCompact: {
    fontSize: 12,
  },
});
