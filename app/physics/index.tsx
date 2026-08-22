import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';
import { colors, radius, spacing } from '../../theme';

interface Sim {
  id: string;
  title: string;
  summary: string;
  topics: string[];
  href?: string;
}

const SIMS: Sim[] = [
  {
    id: 'drop',
    title: 'Drop & Projectile',
    summary:
      'Free fall and projectile motion with real quadratic air drag, across four worlds.',
    topics: ['Kinematics', 'Drag', 'Terminal velocity'],
    href: '/physics/drop',
  },
  {
    id: 'collisions',
    title: 'Collisions',
    summary:
      'Two objects meeting head-on. Watch momentum survive every impact while energy does not.',
    topics: ['Momentum', 'Energy', 'Bounciness'],
    href: '/physics/collisions',
  },
  {
    id: 'pendulum',
    title: 'Pendulum',
    summary: 'Simple and damped pendulums, plus the small-angle approximation.',
    topics: ['Oscillation', 'Damping'],
  },
  {
    id: 'incline',
    title: 'Inclined Plane',
    summary: 'Sliding and rolling bodies with static and kinetic friction.',
    topics: ['Friction', 'Torque'],
  },
];

export default function PhysicsIndex() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.intro}>
        Each simulation integrates the real equations of motion. Numbers you read off the
        screen are the numbers the maths produces.
      </Text>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>Available</Text>
        <View style={styles.rule} />
      </View>

      {SIMS.filter((s) => s.href).map((sim) => (
        <SimCard key={sim.id} sim={sim} onPress={() => router.push(sim.href as never)} />
      ))}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>Coming soon</Text>
        <View style={styles.rule} />
      </View>

      {SIMS.filter((s) => !s.href).map((sim) => (
        <SimCard key={sim.id} sim={sim} />
      ))}
    </ScrollView>
  );
}

function SimCard({ sim, onPress }: { sim: Sim; onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const disabled = !onPress;

  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 5 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        disabled={disabled}
        onPressIn={() => spring(0.98)}
        onPressOut={() => spring(1)}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={[styles.card, disabled && styles.cardDisabled]}
      >
        <View style={styles.thumb}>
          <SimThumb id={sim.id} dim={disabled} />
        </View>
        <View style={styles.cardText}>
          <Text style={[styles.cardTitle, disabled && { color: colors.textMuted }]}>
            {sim.title}
          </Text>
          <Text style={styles.cardSummary}>{sim.summary}</Text>
          <View style={styles.topics}>
            {sim.topics.map((t) => (
              <View key={t} style={styles.topic}>
                <Text style={styles.topicText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={[styles.chevron, disabled && { color: colors.textFaint }]}>
          {disabled ? '' : '›'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** Tiny line drawing per module so the list is scannable at a glance. */
function SimThumb({ id, dim }: { id: string; dim: boolean }) {
  const c = dim ? colors.textFaint : colors.accent;
  const o = dim ? 0.5 : 1;
  const size = 46;
  return (
    <Svg width={size} height={size} viewBox="0 0 46 46">
      {id === 'drop' && (
        <>
          <Path d="M8 6 C 20 12, 28 24, 31 34" stroke={c} strokeWidth={1.5} strokeDasharray="2 4" fill="none" opacity={0.6 * o} />
          <Circle cx={31} cy={34} r={5} fill={c} opacity={o} />
          <Ellipse cx={31} cy={40} rx={7} ry={1.8} fill={c} opacity={0.25 * o} />
          <Line x1={4} y1={40} x2={42} y2={40} stroke={c} strokeWidth={1.4} opacity={0.55 * o} />
        </>
      )}
      {id === 'collisions' && (
        <>
          <Circle cx={13} cy={23} r={7} fill={c} opacity={0.85 * o} />
          <Circle cx={33} cy={23} r={5} fill="none" stroke={c} strokeWidth={1.6} opacity={0.7 * o} />
          <Line x1={22} y1={23} x2={27} y2={23} stroke={c} strokeWidth={1.4} opacity={0.6 * o} />
          <Line x1={38} y1={17} x2={42} y2={13} stroke={c} strokeWidth={1.4} opacity={0.5 * o} />
          <Line x1={38} y1={29} x2={42} y2={33} stroke={c} strokeWidth={1.4} opacity={0.5 * o} />
        </>
      )}
      {id === 'pendulum' && (
        <>
          <Line x1={10} y1={7} x2={36} y2={7} stroke={c} strokeWidth={1.5} opacity={0.5 * o} />
          <Line x1={23} y1={7} x2={33} y2={31} stroke={c} strokeWidth={1.4} opacity={0.75 * o} />
          <Circle cx={33} cy={34} r={5} fill={c} opacity={0.85 * o} />
          <Path d="M13 30 A 22 22 0 0 1 20 12" stroke={c} strokeWidth={1.2} strokeDasharray="2 3" fill="none" opacity={0.4 * o} />
        </>
      )}
      {id === 'incline' && (
        <>
          <Path d="M5 38 L 41 38 L 41 12 Z" fill={c} opacity={0.14 * o} />
          <Path d="M5 38 L 41 38 L 41 12 Z" stroke={c} strokeWidth={1.5} fill="none" opacity={0.6 * o} />
          <Rect x={26} y={17} width={9} height={9} rx={1.5} fill={c} opacity={0.85 * o} transform="rotate(-36 30.5 21.5)" />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: spacing.sm },
  intro: {
    color: colors.textMuted,
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  sectionLabel: {
    color: colors.textFaint,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  rule: { flex: 1, height: 1, backgroundColor: colors.strokeSoft },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: spacing.md,
  },
  cardDisabled: { opacity: 0.5, backgroundColor: colors.bgElevated },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { color: colors.text, fontSize: 16.5, fontWeight: '700' },
  cardSummary: { color: colors.textMuted, fontSize: 12.5, lineHeight: 17.5 },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  topic: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  topicText: { color: colors.textFaint, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  chevron: { color: colors.accent, fontSize: 26, fontWeight: '300', marginLeft: 2 },
});
