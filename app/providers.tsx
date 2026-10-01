'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Pressable, StyleSheet, Text, View } from '../components/dom';
import { AuthProvider, useAuth } from '../context/Auth';
import { DetailModeProvider } from '../context/DetailMode';
import { DifficultyProvider, useDifficulty } from '../context/Difficulty';
import { LanguageProvider, useLanguage } from '../context/Language';
// Side-effect import: initialises i18next before any screen renders.
import '../lib/i18n';
import { colors, spacing } from '../theme';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      {/* Auth sits above the content settings: which screen is even
          reachable depends on who is signed in. */}
      <AuthProvider>
        {/* Difficulty sits above DetailMode: the level decides that
            toggle's starting position. */}
        <DifficultyProvider>
          <DetailModeProvider>
            <Shell>{children}</Shell>
          </DetailModeProvider>
        </DifficultyProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

/**
 * Where each page sits in the site, for its header: a title key and the page
 * "Back" falls to when there is no history to go back through. The home and
 * welcome pages carry their own branding and have no header.
 */
const PAGES: Record<string, { title: string; parent: string }> = {
  '/settings': { title: 'settings.title', parent: '/' },
  '/physics': { title: 'nav.physics', parent: '/' },
  '/physics/drop': { title: 'nav.drop', parent: '/physics' },
  '/physics/collisions': { title: 'nav.collisions', parent: '/physics' },
  '/physics/circuits': { title: 'nav.circuits', parent: '/physics' },
  '/physics/magnets': { title: 'nav.magnets', parent: '/physics' },
  '/physics/matter': { title: 'nav.matter', parent: '/physics' },
  '/auth/sign-in': { title: 'auth.signIn.title', parent: '/' },
  '/auth/sign-up': { title: 'auth.signUp.title', parent: '/' },
  '/auth/reset-password': { title: 'auth.reset.title', parent: '/auth/sign-in' },
};

function Shell({ children }: { children: ReactNode }) {
  const { language, ready: languageReady } = useLanguage();
  const { ready: difficultyReady } = useDifficulty();
  const { ready: authReady } = useAuth();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Hold the first paint until every stored setting has been read back, so a
  // non-English visitor never sees a flash of English headers and a signed-in
  // visitor is never shown the welcome page on the way to the home page.
  const ready = languageReady && difficultyReady && authReady;

  return (
    <div id="app-shell">
      {ready ? (
        <>
          <Header />
          <View style={styles.main}>{children}</View>
        </>
      ) : null}
    </div>
  );
}

function Header() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const page = PAGES[pathname.replace(/\/$/, '') || '/'];

  if (!page) return null;

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push(page.parent);
  };

  return (
    <View style={styles.header}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel={t('nav.back')}
        style={styles.back}
      >
        <Text style={styles.backGlyph}>‹</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1} accessibilityRole="heading">
        {t(page.title)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1, minHeight: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 54,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
    borderBottom: `1px solid ${colors.strokeSoft}`,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { color: colors.text, fontSize: 30, lineHeight: 30, marginTop: -4 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 },
});
