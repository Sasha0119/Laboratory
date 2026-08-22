import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';

/**
 * Categories carry only an id and their styling. Every string is looked up at
 * `home.categories.<id>.*`, so adding a language never touches this file.
 */
interface Category {
  id: string;
  tint: string;
  href?: string;
}

const CATEGORIES: Category[] = [
  { id: 'physics', tint: colors.accent, href: '/physics' },
  { id: 'chemistry', tint: colors.violet },
];

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.masthead}>
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <Svg width={26} height={26} viewBox="0 0 24 24">
              {/* Flask outline — the app mark. */}
              <Path
                d="M9.5 2.5v6.2L4.6 17.4A2.6 2.6 0 0 0 6.9 21.4h10.2a2.6 2.6 0 0 0 2.3-4L14.5 8.7V2.5"
                stroke={colors.accent}
                strokeWidth={1.7}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Line x1="8.6" y1="2.5" x2="15.4" y2="2.5" stroke={colors.accent} strokeWidth={1.7} strokeLinecap="round" />
              <Circle cx="10.6" cy="16.4" r="1.25" fill={colors.accent} opacity={0.75} />
              <Circle cx="13.9" cy="18.1" r="0.85" fill={colors.accent} opacity={0.5} />
            </Svg>
          </View>
          <Text style={styles.brand}>{t('app.name')}</Text>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel={t('home.settingsLabel')}
            style={styles.settingsButton}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24">
              {/* Gear */}
              <Circle cx="12" cy="12" r="3.1" stroke={colors.textMuted} strokeWidth={1.7} fill="none" />
              <Path
                d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6L17 17M7 7L5.4 5.4"
                stroke={colors.textMuted}
                strokeWidth={1.7}
                strokeLinecap="round"
              />
            </Svg>
          </Pressable>
        </View>
        <Text style={styles.tagline}>{t('home.tagline')}</Text>
      </View>

      {CATEGORIES.map((cat) => (
        <CategoryCard
          key={cat.id}
          category={cat}
          onPress={cat.href ? () => router.push(cat.href as never) : undefined}
        />
      ))}

      <Text style={styles.footnote}>{t('home.footnote')}</Text>
    </ScrollView>
  );
}

function CategoryCard({ category, onPress }: { category: Category; onPress?: () => void }) {
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;
  const disabled = !onPress;
  const base = `home.categories.${category.id}`;

  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 5 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        disabled={disabled}
        onPressIn={() => spring(0.975)}
        onPressOut={() => spring(1)}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t(`${base}.title`)}
        style={[styles.card, disabled && styles.cardDisabled]}
      >
        <View style={[styles.cardArt, { pointerEvents: 'none' }]}>
          <CardArt id={category.id} tint={category.tint} dim={disabled} />
        </View>

        <View style={styles.cardBody}>
          <View style={[styles.pill, { borderColor: category.tint + '55' }]}>
            <Text style={[styles.pillText, { color: disabled ? colors.textFaint : category.tint }]}>
              {t(`${base}.modules`)}
            </Text>
          </View>
          <Text style={[styles.cardTitle, disabled && { color: colors.textMuted }]}>
            {t(`${base}.title`)}
          </Text>
          <Text style={styles.cardSubtitle}>{t(`${base}.subtitle`)}</Text>
          <Text style={styles.cardDetail}>{t(`${base}.detail`)}</Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={[styles.cta, { color: disabled ? colors.textFaint : category.tint }]}>
            {disabled ? t('common.comingSoon') : t('home.openBench')}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Decorative corner artwork hinting at what each bench does. */
function CardArt({ id, tint, dim }: { id: string; tint: string; dim: boolean }) {
  const o = dim ? 0.22 : 1;
  if (id === 'physics') {
    return (
      <Svg width={130} height={130} viewBox="0 0 130 130">
        <Defs>
          <RadialGradient id="phGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={tint} stopOpacity={0.32 * o} />
            <Stop offset="1" stopColor={tint} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={78} cy={44} r={54} fill="url(#phGlow)" />
        {/* A falling ball with its arc and its shadow. */}
        <Path
          d="M22 16 C 52 30, 74 62, 84 100"
          stroke={tint}
          strokeWidth={1.6}
          strokeDasharray="3 6"
          fill="none"
          opacity={0.5 * o}
        />
        {[0.15, 0.42, 0.68].map((f, i) => (
          <Circle key={i} cx={22 + f * 62} cy={16 + f * f * 84} r={3.4 - i * 0.6} fill={tint} opacity={(0.2 + i * 0.16) * o} />
        ))}
        <Circle cx={84} cy={100} r={9} fill={tint} opacity={0.92 * o} />
        <Ellipse cx={84} cy={116} rx={13} ry={3.4} fill={tint} opacity={0.2 * o} />
        <Line x1={14} y1={116} x2={122} y2={116} stroke={tint} strokeWidth={1.4} opacity={0.35 * o} />
      </Svg>
    );
  }
  return (
    <Svg width={130} height={130} viewBox="0 0 130 130">
      <Defs>
        <RadialGradient id="chGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={tint} stopOpacity={0.26 * o} />
          <Stop offset="1" stopColor={tint} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={72} cy={54} r={52} fill="url(#chGlow)" />
      {/* A benzene-ish ring of bonded atoms. */}
      <G opacity={o}>
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const b = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
          const cx = 70;
          const cy = 62;
          const R = 30;
          return (
            <Line
              key={i}
              x1={cx + Math.cos(a) * R}
              y1={cy + Math.sin(a) * R}
              x2={cx + Math.cos(b) * R}
              y2={cy + Math.sin(b) * R}
              stroke={tint}
              strokeWidth={1.5}
              opacity={0.55}
            />
          );
        })}
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          return (
            <Circle key={i} cx={70 + Math.cos(a) * 30} cy={62 + Math.sin(a) * 30} r={5} fill={tint} opacity={0.7} />
          );
        })}
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },

  masthead: { marginBottom: spacing.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  settingsButton: {
    marginLeft: 'auto',
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.sm,
    maxWidth: 320,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.stroke,
    overflow: 'hidden',
    minHeight: 194,
  },
  cardDisabled: { opacity: 0.62 },
  cardArt: { position: 'absolute', right: -8, top: -6 },
  cardBody: { padding: spacing.lg, paddingBottom: spacing.sm, gap: 5 },
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 6,
  },
  pillText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.7 },
  cardTitle: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  cardSubtitle: { color: colors.textMuted, fontSize: 13.5, fontWeight: '600' },
  cardDetail: {
    color: colors.textFaint,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 230,
  },
  cardFooter: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    marginTop: 'auto',
  },
  cta: { fontSize: 13.5, fontWeight: '700', letterSpacing: 0.2 },

  footnote: {
    color: colors.textFaint,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
