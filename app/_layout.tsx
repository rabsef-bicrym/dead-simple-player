import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import Constants from 'expo-constants';
import { walnut, FONT_ASSETS } from '../src/constants/ds6';
import { flushTuneTrace, hydrateTuneTrace, setTuneTraceBuild } from '../src/services/tuneTrace';

/**
 * Every tune the bench records says which build it came from. The number is
 * Info.plist's CFBundleVersion, which expo-constants publishes as
 * `platform.ios.buildNumber` (EXConstantsService.m:52-59); EAS writes it
 * there (eas.json `appVersionSource: remote`) and app.json carries no
 * `ios.buildNumber`, so the config's copy is only a fallback for a local
 * build that sets one. `nativeBuildVersion` is gone since expo-constants 16
 * (#26329) and tsc accepted it only through the `Record<string, any>` tail;
 * its replacement, expo-application, is not a dependency (rule 5). The web
 * has no native platform manifest and reports the config's version alone.
 */
function describeBuild(): string | undefined {
  const appVersion = Constants.expoConfig?.version ?? null;
  const buildNumber = Constants.platform?.ios?.buildNumber ?? Constants.expoConfig?.ios?.buildNumber ?? null;
  if (!appVersion) return undefined;
  return buildNumber ? `${appVersion} (${buildNumber})` : appVersion;
}

/** Root layout — dark theme, no headers by default. */
export default function RootLayout() {
  // DS-6 faceplate faces; render proceeds with fallbacks while loading.
  useFonts(FONT_ASSETS);

  // The trace ring survives a relaunch: stamp the build, read the ring once,
  // write it when the set leaves the foreground. The stamp lands before any
  // tune can start (every tune waits on the restored dial); the ring's own
  // write after a close is debounced; nothing here touches the first-frame
  // path.
  useEffect(() => {
    setTuneTraceBuild(describeBuild());
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
