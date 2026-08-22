import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
}

const PAD = 4;
const PAD_COMPACT = 3;

/**
 * Segmented control with a sliding highlight. Only a translation is animated,
 * and on the native driver, so it stays smooth alongside the simulation loop.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tint = colors.accent,
  compact = false,
}: Props<T>) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const slide = useRef(new Animated.Value(index)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    Animated.spring(slide, {
      toValue: index,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [index, slide]);

  const pad = compact ? PAD_COMPACT : PAD;
  const segmentWidth = trackWidth > 0 ? (trackWidth - pad * 2) / options.length : 0;

  return (
    <View
      style={[styles.track, compact && styles.trackCompact]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.indicator,
            compact && styles.indicatorCompact,
            {
              width: segmentWidth,
              backgroundColor: tint + '22',
              borderColor: tint + '66',
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: options.length > 1 ? options.map((_, i) => i) : [0, 1],
                    outputRange:
                      options.length > 1
                        ? options.map((_, i) => i * segmentWidth)
                        : [0, 0],
                  }),
                },
              ],
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
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              if (Platform.OS !== 'web') {
                Haptics.selectionAsync().catch(() => {});
              }
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
