import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { walnut, FONT_ASSETS } from '../src/constants/ds6';

/** Root layout — dark theme, no headers by default. */
export default function RootLayout() {
  // DS-6 faceplate faces; render proceeds with fallbacks while loading.
  useFonts(FONT_ASSETS);
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
