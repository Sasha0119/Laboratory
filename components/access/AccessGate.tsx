import { useRouter } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useContentAccess } from '../../hooks/useContentAccess';
import type { DifficultyLevel } from '../../lib/difficulty';
import { colors } from '../../theme';

/**
 * Wraps a simulation screen so the gate holds even when the topic list is
 * bypassed — a deep link, a restored navigation state, or a subscription that
 * lapsed while the screen was still on the stack.
 *
 * `replace` rather than `push`: the locked screen should not be sitting behind
 * the paywall for Back to land on.
 *
 * A blank panel is rendered rather than the children while the decision is
 * being made, so a free reader never sees a frame of paid content.
 */
export function AccessGate({
  level,
  children,
}: {
  level: DifficultyLevel;
  children: ReactNode;
}) {
  const router = useRouter();
  const { ready, canAccess } = useContentAccess();
  const allowed = canAccess(level);

  useEffect(() => {
    if (!ready || allowed) return;
    router.replace({ pathname: '/paywall', params: { level } });
  }, [ready, allowed, level, router]);

  if (!ready || !allowed) return <View style={styles.blank} />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: colors.bg },
});
