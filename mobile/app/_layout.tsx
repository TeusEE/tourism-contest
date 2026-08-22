import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnalysisProvider } from '@/src/state/analysis';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf') });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <AnalysisProvider>
        <ThemeProvider value={DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="results" options={{ title: '분석 결과' }} />
          </Stack>
        </ThemeProvider>
      </AnalysisProvider>
    </SafeAreaProvider>
  );
}
