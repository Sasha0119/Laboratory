import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { Button } from '../components/ui/Button';
import { useAuth } from '../context/Auth';
import { useContentAccess } from '../hooks/useContentAccess';
import { isDifficultyLevel } from '../lib/difficulty';
import { colors, radius, spacing } from '../theme';

/**
 * The one place in the app that mentions paying for anything.
 *
 * It is reached only by tapping into content that is out of reach — never
 * shown on a timer, never on launch, never as a banner over something else.
 * That restraint is the whole design: if the reader has not asked, they do not
 * see this screen.
 *
 * What is deliberately absent: countdowns, "limited time", strikethrough
 * prices, a dismiss control hidden in a corner, or copy that implies the free
 * benches are lesser. "Maybe later" is a full-width, plainly worded control
 * sitting directly under the offer.
 *
 * The Subscribe button is a placeholder until real purchases are wired in. It
 * is styled exactly as it will be when it works, and says so when tapped,
 * rather than being greyed out and looking broken.
 */

/** The benefits listed, as translation key suffixes: `paywall.benefits.<id>`. */
const BENEFITS = ['depth', 'formulas', 'topics'] as const;

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { mode } = useAuth();
  const { isPro } = useContentAccess();

  const { level } = useLocalSearchParams<{ level?: string }>();
  const reachedFor = isDifficultyLevel(level) ? level : null;

  const [comingSoon, setComingSoon] = useState(false);

  const signedIn = mode === 'account';

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/physics');
  };

  // If access is granted while this screen is open — the reader logged into an
  // account that already has it — get out of the way rather than making them
  // find the back button.
  useEffect(() => {
    if (isPro) dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.lg },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.badge}>
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Rect x={5} y={10.5} width={14} height={9.5} rx={2.2} fill={colors.violet} opacity={0.9} />
          <Path
            d="M8.4 10.5V8.2a3.6 3.6 0 0 1 7.2 0v2.3"
            stroke={colors.violet}
            strokeWidth={1.8}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      </View>

      <Text style={styles.headline}>{t('paywall.headline')}</Text>
      {reachedFor ? (
        <Text style={styles.reachedFor}>
          {t('paywall.reachedFor', { level: t(`difficulty.levels.${reachedFor}.label`) })}
        </Text>
      ) : null}
      <Text style={styles.lede}>{t('paywall.lede')}</Text>

      <View style={styles.benefits}>
        {BENEFITS.map((id) => (
          <View key={id} style={styles.benefit}>
            <Svg width={16} height={16} viewBox="0 0 16 16" style={styles.tick}>
              <Path
                d="M3 8.4 L6.4 11.8 L13 4.6"
                stroke={colors.accent}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <View style={styles.benefitText}>
              <Text style={styles.benefitTitle}>{t(`paywall.benefits.${id}.title`)}</Text>
              <Text style={styles.benefitBody}>{t(`paywall.benefits.${id}.body`)}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.freeNote}>{t('paywall.freeNote')}</Text>

      {/* A guest cannot hold a subscription, so the account step comes first
          for them — it is the actual next thing to do, not an upsell. */}
      {!signedIn ? (
        <View style={styles.accountBlock}>
          <Text style={styles.accountNote}>{t('paywall.accountNote')}</Text>
          <Button
            label={t('paywall.createAccount')}
            onPress={() => router.push('/auth/sign-up')}
          />
          <Button
            label={t('paywall.logIn')}
            variant="ghost"
            onPress={() => router.push('/auth/sign-in')}
          />
        </View>
      ) : null}

      <View style={styles.subscribeBlock}>
        <Button
          label={t('paywall.subscribe')}
          tone={colors.violet}
          variant={signedIn ? 'primary' : 'ghost'}
          onPress={() => setComingSoon(true)}
        />
        {comingSoon ? <Text style={styles.comingSoon}>{t('paywall.comingSoon')}</Text> : null}
      </View>

      <Pressable onPress={dismiss} accessibilityRole="button" style={styles.dismiss}>
        <Text style={styles.dismissText}>{t('paywall.maybeLater')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg },

  badge: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  headline: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4, lineHeight: 33 },
  reachedFor: { color: colors.violet, fontSize: 12.5, fontWeight: '700', marginTop: 7 },
  lede: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },

  benefits: {
    gap: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.strokeSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  benefit: { flexDirection: 'row', gap: spacing.sm + 2 },
  tick: { marginTop: 2 },
  benefitText: { flex: 1, gap: 3 },
  benefitTitle: { color: colors.text, fontSize: 14.5, fontWeight: '700' },
  benefitBody: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18.5 },

  freeNote: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.md,
    paddingHorizontal: 2,
  },

  accountBlock: { gap: spacing.sm, marginTop: spacing.lg },
  accountNote: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },

  subscribeBlock: { marginTop: spacing.lg, gap: spacing.sm },
  comingSoon: {
    color: colors.violet,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },

  dismiss: { paddingVertical: spacing.md, marginTop: spacing.xs, alignItems: 'center' },
  dismissText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});
