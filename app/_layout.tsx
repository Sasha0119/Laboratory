import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
          {/* Difficulty sits above DetailMode: the level decides that
              toggle's starting position. */}
          <DifficultyProvider>
            <DetailModeProvider>
              <StatusBar style="light" />
              <Navigator />
            </DetailModeProvider>
          </DifficultyProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Navigator() {
  const { t } = useTranslation();
  const { ready: languageReady } = useLanguage();
  const { ready: difficultyReady } = useDifficulty();

  // Hold the first paint until both stored settings have been read back, so a
  // non-English user never sees a flash of English headers and a Pro user
  // never sees the beginner layout blink past.
  if (!languageReady || !difficultyReady) {
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
    </Stack>
  );
}
