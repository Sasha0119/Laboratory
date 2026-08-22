import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DetailModeProvider } from '../context/DetailMode';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        {/* Detail mode is app-wide so it carries between simulation modules. */}
        <DetailModeProvider>
          <StatusBar style="light" />
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
            <Stack.Screen name="physics/index" options={{ title: 'Physics' }} />
            <Stack.Screen
              name="physics/drop"
              options={{ title: 'Drop & Projectile', headerBackTitle: 'Physics' }}
            />
            <Stack.Screen
              name="physics/collisions"
              options={{ title: 'Collisions', headerBackTitle: 'Physics' }}
            />
          </Stack>
        </DetailModeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
