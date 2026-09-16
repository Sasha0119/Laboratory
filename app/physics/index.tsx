import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

import { Segmented } from '../../components/ui/Segmented';
import { useDifficulty } from '../../context/Difficulty';
import { useContentAccess } from '../../hooks/useContentAccess';
import { TOPICS, type Topic } from '../../lib/catalogue';
import { DIFFICULTY_ORDER, type DifficultyLevel } from '../../lib/difficulty';
import { colors, radius, spacing } from '../../theme';

/** Colour per level, so badges are distinguishable at a glance. */
const LEVEL_TINT: Record<DifficultyLevel, string> = {
  beginner: colors.accent,
  intermediate: colors.blue,
  pro: colors.violet,
};

export default function PhysicsIndex() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { level, setLevel } = useDifficulty();
  const access = useContentAccess();

  /**
   * Every topic stays visible whatever the level — a curious reader should be
   * able to look ahead. The selected level simply comes first, and within each
   * group the working simulations lead.
   */
  const groups = useMemo(() => {
    const order = [level, ...DIFFICULTY_ORDER.filter((l) => l !== level)];
    return order.map((groupLevel) => ({
      level: groupLevel,
      isSelected: groupLevel === level,
      items: TOPICS.filter((topic) => topic.level === groupLevel).sort(
        (a, b) => Number(!!b.href) - Number(!!a.href)
      ),
    }));
  }, [level]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.levelPicker}>
        <Text style={styles.levelLabel}>{t('difficulty.title')}</Text>
        <Segmented<DifficultyLevel>
          options={DIFFICULTY_ORDER.map((id) => ({
            value: id,
            label: t(`difficulty.short.${id}`),
          }))}
          value={level}
          onChange={setLevel}
          tint={LEVEL_TINT[level]}
        />
        <Text style={styles.levelGrades}>{t(`difficulty.levels.${level}.grades`)}</Text>
      </View>

      <Text style={styles.intro}>{t('physicsIndex.intro')}</Text>

      {groups.map((group) => (
        <View key={group.level}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>
              {t(`difficulty.levels.${group.level}.label`)}
            </Text>
            {group.isSelected ? (
              <View style={[styles.yourLevel, { borderColor: LEVEL_TINT[group.level] + '66' }]}>
                <Text style={[styles.yourLevelText, { color: LEVEL_TINT[group.level] }]}>
                  {t('difficulty.yourLevel')}
                </Text>
              </View>
            ) : null}
            <View style={styles.rule} />
          </View>

          {group.items.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              // `open` decides for itself whether this leads to the simulation
              // or to the paywall — the card never has to know.
              onPress={topic.href ? () => access.open(topic) : undefined}
              locked={!!topic.href && access.isLocked(topic)}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function TopicCard({
  topic,
  onPress,
  locked = false,
}: {
  topic: Topic;
  onPress?: () => void;
  /** Built, but out of reach without a subscription. */
  locked?: boolean;
}) {
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;
  const [showNotice, setShowNotice] = useState(false);
  const disabled = !onPress;
  const tint = LEVEL_TINT[topic.level];

  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 5 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPressIn={() => spring(0.98)}
        onPressOut={() => spring(1)}
        // A placeholder is still tappable — it just explains itself rather
        // than navigating anywhere.
        onPress={onPress ?? (() => setShowNotice((v) => !v))}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityHint={locked ? t('access.lockedHint') : undefined}
        style={[styles.card, disabled && styles.cardDisabled]}
      >
        <View style={styles.cardTop}>
          <View style={styles.thumb}>
            <SimThumb id={topic.id} dim={disabled} tint={tint} />
          </View>
          <View style={styles.cardText}>
            <Text
              style={[styles.cardTitle, disabled && { color: colors.textMuted }]}
              numberOfLines={2}
            >
              {t(`physicsIndex.sims.${topic.id}.title`)}
            </Text>
            <Text style={styles.cardSummary}>
              {t(`physicsIndex.sims.${topic.id}.summary`)}
            </Text>

            <View style={styles.chips}>
              <View style={[styles.levelBadge, { borderColor: tint + '55' }]}>
                <Text
                  style={[styles.levelBadgeText, { color: disabled ? colors.textFaint : tint }]}
                >
                  {t(`difficulty.short.${topic.level}`)}
                </Text>
              </View>
              {disabled ? (
                <View style={styles.soonBadge}>
                  <Text style={styles.soonBadgeText}>{t('common.comingSoon')}</Text>
                </View>
              ) : null}
              {topic.topics?.map((chip) => (
                <View key={chip} style={styles.topic}>
                  <Text style={styles.topicText}>{t(`physicsIndex.topics.${chip}`)}</Text>
                </View>
              ))}
            </View>
          </View>
          {/* A lock rather than a chevron: the card still opens, it just does
              not open onto the simulation. Saying so up front is honest — an
              unannounced paywall would be the dark pattern. */}
          {locked ? (
            <Svg width={17} height={17} viewBox="0 0 24 24" style={styles.lock}>
              <Rect x={5} y={10.5} width={14} height={9.5} rx={2.2} fill={colors.textMuted} opacity={0.8} />
              <Path
                d="M8.4 10.5V8.2a3.6 3.6 0 0 1 7.2 0v2.3"
                stroke={colors.textMuted}
                strokeWidth={1.9}
                fill="none"
                strokeLinecap="round"
              />
            </Svg>
          ) : !disabled ? (
            <Text style={styles.chevron}>›</Text>
          ) : null}
        </View>

        {showNotice && disabled ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{t('physicsIndex.comingSoonMessage')}</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Line drawing per topic. Related topics share a mark, so every card has one
 * without needing sixteen bespoke drawings.
 */
function SimThumb({ id, dim, tint }: { id: string; dim: boolean; tint: string }) {
  const c = dim ? colors.textFaint : tint;
  const o = dim ? 0.55 : 1;
  return (
    <Svg width={46} height={46} viewBox="0 0 46 46">
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
      {(id === 'simpleCircuits' || id === 'ohmsLaw') && (
        <>
          <Rect x={7} y={14} width={32} height={20} rx={3} fill="none" stroke={c} strokeWidth={1.5} opacity={0.6 * o} />
          <Circle cx={23} cy={14} r={4.5} fill={c} opacity={0.85 * o} />
          <Line x1={15} y1={34} x2={15} y2={30} stroke={c} strokeWidth={1.8} opacity={0.7 * o} />
          <Line x1={31} y1={34} x2={31} y2={30} stroke={c} strokeWidth={1.8} opacity={0.7 * o} />
        </>
      )}
      {(id === 'magnets' || id === 'induction') && (
        <>
          <Path d="M15 32 V 21 a 8 8 0 0 1 16 0 V 32" fill="none" stroke={c} strokeWidth={3} opacity={0.7 * o} />
          <Line x1={15} y1={32} x2={15} y2={38} stroke={c} strokeWidth={3} opacity={0.95 * o} />
          <Line x1={31} y1={32} x2={31} y2={38} stroke={c} strokeWidth={3} opacity={0.4 * o} />
        </>
      )}
      {(id === 'statesOfMatter' || id === 'thermodynamics') && (
        <>
          <Path d="M18 33 V 14 a 5 5 0 0 1 10 0 V 33" fill="none" stroke={c} strokeWidth={1.5} opacity={0.6 * o} />
          <Circle cx={23} cy={34} r={6} fill={c} opacity={0.85 * o} />
          <Line x1={23} y1={19} x2={23} y2={30} stroke={c} strokeWidth={2.6} opacity={0.85 * o} />
        </>
      )}
      {(id === 'simpleMachines' || id === 'advancedDrag') && (
        <>
          <Path d="M5 38 L 41 38 L 41 12 Z" fill={c} opacity={0.14 * o} />
          <Path d="M5 38 L 41 38 L 41 12 Z" stroke={c} strokeWidth={1.5} fill="none" opacity={0.6 * o} />
          <Rect x={26} y={17} width={9} height={9} rx={1.5} fill={c} opacity={0.85 * o} transform="rotate(-36 30.5 21.5)" />
        </>
      )}
      {(id === 'waves' || id === 'light') && (
        <>
          <Path d="M5 22 q 6 -11 12 0 t 12 0 t 12 0" fill="none" stroke={c} strokeWidth={1.8} opacity={0.8 * o} />
          <Line x1={5} y1={34} x2={41} y2={34} stroke={c} strokeWidth={1.2} strokeDasharray="2 4" opacity={0.4 * o} />
        </>
      )}
      {(id === 'energyConservation' || id === 'harmonicMotion') && (
        <>
          <Line x1={10} y1={7} x2={36} y2={7} stroke={c} strokeWidth={1.5} opacity={0.5 * o} />
          <Line x1={23} y1={7} x2={33} y2={31} stroke={c} strokeWidth={1.4} opacity={0.75 * o} />
          <Circle cx={33} cy={34} r={5} fill={c} opacity={0.85 * o} />
          <Path d="M13 30 A 22 22 0 0 1 20 12" stroke={c} strokeWidth={1.2} strokeDasharray="2 3" fill="none" opacity={0.4 * o} />
        </>
      )}
      {(id === 'pressureBuoyancy' || id === 'rotational') && (
        <>
          <Path d="M5 27 q 6 -4 12 0 t 12 0 t 12 0" fill="none" stroke={c} strokeWidth={1.6} opacity={0.65 * o} />
          <Rect x={17} y={16} width={12} height={12} rx={2} fill={c} opacity={0.8 * o} />
          <Path d="M5 35 q 6 -4 12 0 t 12 0 t 12 0" fill="none" stroke={c} strokeWidth={1.3} opacity={0.35 * o} />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: spacing.sm },

  levelPicker: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: spacing.md,
    gap: spacing.sm,
  },
  levelLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  levelGrades: { color: colors.textFaint, fontSize: 11.5, textAlign: 'center' },

  intro: { color: colors.textMuted, fontSize: 13.5, lineHeight: 20, marginTop: spacing.xs },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  yourLevel: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
  },
  yourLevelText: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5 },
  rule: { flex: 1, height: 1, backgroundColor: colors.strokeSoft },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardDisabled: { backgroundColor: colors.bgElevated, borderColor: colors.strokeSoft },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardSummary: { color: colors.textMuted, fontSize: 12.5, lineHeight: 17.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  levelBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelBadgeText: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 },
  soonBadge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  soonBadgeText: { color: colors.textFaint, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 },
  topic: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  topicText: { color: colors.textFaint, fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  chevron: { color: colors.accent, fontSize: 26, fontWeight: '300', marginLeft: 2 },
  lock: { marginLeft: 2, marginRight: 3 },

  notice: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.strokeSoft,
  },
  noticeText: { color: colors.amber, fontSize: 12.5, lineHeight: 18 },
});
