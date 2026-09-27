import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import Constants from 'expo-constants';
import { walnut, FONT_ASSETS } from '../src/constants/ds6';
import { flushTuneTrace, hydrateTuneTrace, setTuneTraceBuild } from '../src/services/tuneTrace';

// Every tune the bench records says which build it came from.
const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null;
const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? Constants.nativeBuildVersion ?? null;
setTuneTraceBuild(appVersion ? (buildNumber ? `${appVersion} (${buildNumber})` : appVersion) : undefined);

/** Root layout — dark theme, no headers by default. */
export default function RootLayout() {
  // DS-6 faceplate faces; render proceeds with fallbacks while loading.
  useFonts(FONT_ASSETS);

  // The trace ring survives a relaunch: read it once, write it when the set
  // leaves the foreground. The ring's own write after a close is debounced;
  // neither touches the first-frame path.
  useEffect(() => {
    void hydrateTuneTrace();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flushTuneTrace();
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: walnut.void },
          animation: 'fade',
        }}
      />
    </GestureHandlerRootView>
  );
}
