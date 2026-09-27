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
 * Every tune the bench records says which build it came from. EAS assigns
 * the build number remotely (eas.json `appVersionSource`) and writes it to
 * Info.plist only — app.json carries no `ios.buildNumber` — so the deprecated
 * `nativeBuildVersion` is the one place the number lives; its replacement,
 * expo-application, is not a dependency (rule 5). The web has neither native
 * field and reports the config's version alone.
 */
function describeBuild(): string | undefined {
  const appVersion = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? null;
  const buildNumber = Constants.nativeBuildVersion ?? Constants.expoConfig?.ios?.buildNumber ?? null;
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
