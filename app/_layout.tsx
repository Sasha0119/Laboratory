import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../context/Auth';
import { DetailModeProvider } from '../context/DetailMode';
import { DifficultyProvider, useDifficulty } from '../context/Difficulty';
import { LanguageProvider, useLanguage } from '../context/Language';
// Side-effect import: initialises i18next before any screen renders.
import '../lib/i18n';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <LanguageProvider>
          {/* Auth sits above the content settings: which screen is even
              reachable depends on who is signed in. */}
          <AuthProvider>
            {/* Difficulty sits above DetailMode: the level decides that
                toggle's starting position. */}
            <DifficultyProvider>
              <DetailModeProvider>
                <StatusBar style="light" />
                <Navigator />
              </DetailModeProvider>
            </DifficultyProvider>
          </AuthProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Navigator() {
  const { t } = useTranslation();
  const { ready: languageReady } = useLanguage();
  const { ready: difficultyReady } = useDifficulty();
  const { ready: authReady } = useAuth();

  // Hold the first paint until every stored setting has been read back, so a
  // non-English user never sees a flash of English headers, a Pro user never
  // sees the beginner layout blink past, and a signed-in reader is never shown
  // the welcome screen on the way to the home screen.
  if (!languageReady || !difficultyReady || !authReady) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
      <Stack.Screen name="physics/index" options={{ title: t('nav.physics') }} />
      <Stack.Screen
        name="physics/drop"
        options={{ title: t('nav.drop'), headerBackTitle: t('nav.physics') }}
      />
      <Stack.Screen
        name="physics/collisions"
        options={{ title: t('nav.collisions'), headerBackTitle: t('nav.physics') }}
      />
      <Stack.Screen
        name="physics/circuits"
        options={{ title: t('nav.circuits'), headerBackTitle: t('nav.physics') }}
      />
      <Stack.Screen
        name="physics/magnets"
        options={{ title: t('nav.magnets'), headerBackTitle: t('nav.physics') }}
      />

      {/* The welcome screen carries its own branding, so no header. */}
      <Stack.Screen name="auth/welcome" options={{ headerShown: false }} />
      <Stack.Screen name="auth/sign-in" options={{ title: t('auth.signIn.title') }} />
      <Stack.Screen name="auth/sign-up" options={{ title: t('auth.signUp.title') }} />
      <Stack.Screen name="auth/reset-password" options={{ title: t('auth.reset.title') }} />
      <Stack.Screen name="paywall" options={{ title: t('paywall.title') }} />
    </Stack>
  );
}
