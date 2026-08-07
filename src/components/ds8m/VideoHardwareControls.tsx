import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { brass, walnut } from '../../constants/ds6';

interface VideoHardwareControlsProps {
  onStop: () => void;
  onActivity: (control: 'stop' | 'orientation') => void;
}

// One lock, always with an exit. The plate toggles, and releasing the lock
// restores the OS's own auto-rotation — the set must never trap a form factor.
let landscapeLocked = false;

function isLandscapeLock(lock: ScreenOrientation.OrientationLock): boolean {
  return lock === ScreenOrientation.OrientationLock.LANDSCAPE
    || lock === ScreenOrientation.OrientationLock.LANDSCAPE_LEFT
    || lock === ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT;
}

async function refreshOrientationTruth(): Promise<void> {
  try {
    landscapeLocked = isLandscapeLock(await ScreenOrientation.getOrientationLockAsync());
  } catch {
    // If the OS cannot report its lock, retain the last settled truth we have.
  }
}

export async function releaseOrientation(): Promise<void> {
  if (!landscapeLocked) return;
  try {
    await ScreenOrientation.unlockAsync();
    landscapeLocked = false;
  } catch {
    await refreshOrientationTruth();
  }
}

async function toggleLandscape(): Promise<void> {
  if (landscapeLocked) {
    await releaseOrientation();
    return;
  }
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    landscapeLocked = true;
  } catch {
    await refreshOrientationTruth();
  }
}

/** Hardware plates over the glass; every glyph is drawn from cabinet parts. */
export function VideoHardwareControls({ onStop, onActivity }: VideoHardwareControlsProps) {
  const [orientationLocked, setOrientationLocked] = useState(landscapeLocked);

  useEffect(() => () => {
    void releaseOrientation();
  }, []);

  const handleOrientationPress = async () => {
    await toggleLandscape();
    setOrientationLocked(landscapeLocked);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop playback"
        hitSlop={10}
        onPress={() => {
          onActivity('stop');
          void releaseOrientation();
          onStop();
        }}
        style={[styles.plate, styles.stopPlate]}
      >
        <View style={[styles.xStroke, styles.xForward]} />
        <View style={[styles.xStroke, styles.xBack]} />
      </Pressable>

      {Platform.OS !== 'web' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={orientationLocked ? 'Return the set to portrait' : 'Turn the set landscape'}
          hitSlop={10}
          onPress={() => {
            onActivity('orientation');
            void handleOrientationPress();
          }}
          style={[styles.plate, styles.rotatePlate]}
        >
          <View style={orientationLocked ? styles.portraitScreen : styles.landscapeScreen} />
          <View style={orientationLocked ? styles.arrowStemBack : styles.arrowStem} />
          <View style={orientationLocked ? styles.arrowHeadBack : styles.arrowHead} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    position: 'absolute',
    width: 42,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 4,
    backgroundColor: 'rgba(36,24,12,0.9)',
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 12,
  },
  stopPlate: {
    left: 10,
    top: 10,
  },
  rotatePlate: {
    right: 10,
    bottom: 10,
  },
  xStroke: {
    position: 'absolute',
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: brass.bright,
  },
  xForward: {
    transform: [{ rotate: '45deg' }],
  },
  xBack: {
    transform: [{ rotate: '-45deg' }],
  },
  landscapeScreen: {
    width: 24,
    height: 15,
    borderWidth: 2,
    borderColor: brass.mid,
    borderRadius: 2,
  },
  portraitScreen: {
    width: 15,
    height: 24,
    borderWidth: 2,
    borderColor: brass.mid,
    borderRadius: 2,
  },
  arrowStem: {
    position: 'absolute',
    right: 6,
    top: 5,
    width: 10,
    height: 7,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: brass.bright,
    borderTopRightRadius: 5,
  },
  arrowHead: {
    position: 'absolute',
    right: 4,
    top: 9,
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 6,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: brass.bright,
  },
  arrowStemBack: {
    position: 'absolute',
    left: 6,
    top: 5,
    width: 10,
    height: 7,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: brass.bright,
    borderTopLeftRadius: 5,
  },
  arrowHeadBack: {
    position: 'absolute',
    left: 4,
    top: 9,
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderRightWidth: 6,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: brass.bright,
  },
});
