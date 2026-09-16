import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/Auth';
import { colors, radius, spacing } from '../../theme';

/**
 * The first thing a new reader sees, and the only time they are asked to
 * decide anything about an account.
 *
 * "Continue without an account" is a full-size, equally readable option rather
 * than a grey afterthought — the Beginner benches are genuinely free, and the
 * screen should say so plainly. Once the choice is made it is remembered, and
 * this screen is not shown again.
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { continueAsGuest } = useAuth();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.mark}>
        <Svg width={34} height={34} viewBox="0 0 24 24">
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
      <Text style={styles.tagline}>{t('auth.welcome.tagline')}</Text>

      <View style={styles.actions}>
        <Button
          label={t('auth.welcome.createAccount')}
          onPress={() => router.push('/auth/sign-up?flow=onboarding')}
        />
        <Button
          label={t('auth.welcome.logIn')}
          variant="ghost"
          onPress={() => router.push('/auth/sign-in?flow=onboarding')}
        />
        <Pressable
          onPress={() => {
            continueAsGuest();
            router.replace('/');
          }}
          accessibilityRole="button"
          style={styles.guest}
        >
          <Text style={styles.guestLabel}>{t('auth.welcome.continueAsGuest')}</Text>
          <Text style={styles.guestNote}>{t('auth.welcome.guestNote')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  mark: {
    width: 62,
    height: 62,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  brand: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -0.7 },
  tagline: {
    color: colors.textMuted,
    fontSize: 14.5,
    lineHeight: 22,
    marginTop: spacing.sm,
    maxWidth: 330,
  },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  guest: { paddingVertical: spacing.md, alignItems: 'center', gap: 4 },
  guestLabel: { color: colors.accent, fontSize: 14.5, fontWeight: '700' },
  guestNote: { color: colors.textFaint, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
