import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import {
  FILAMENT_COOL_EASE,
  FILAMENT_WANDER_MS,
  FILAMENT_WARM_EASE,
  LAMP_COOL_MS,
  LAMP_WARM_MS,
  motionDuration,
  useReducedMotion,
} from './motion';

interface FilamentLampProps {
  style?: StyleProp<ViewStyle>;
  /** Normal random-walk depth. A caught flicker may briefly reach twice this. */
  amplitude?: number;
  lit?: boolean;
  testID?: string;
}

/** A lamp with thermal mass and one slow, interruptible filament random-walk. */
export function FilamentLamp({
  style,
  amplitude = 0.035,
  lit = true,
  testID,
}: FilamentLampProps) {
  const reducedMotion = useReducedMotion();
  const glow = useRef(new Animated.Value(lit ? 1 : 0.16)).current;

  useEffect(() => {
    glow.stopAnimation();
    Animated.timing(glow, {
      toValue: lit ? 1 : 0.16,
      duration: motionDuration(lit ? LAMP_WARM_MS : LAMP_COOL_MS, reducedMotion),
      easing: lit ? FILAMENT_WARM_EASE : FILAMENT_COOL_EASE,
      useNativeDriver: true,
    }).start();
    return () => glow.stopAnimation();
  }, [glow, lit, reducedMotion]);

  useEffect(() => {
    if (!lit || reducedMotion || amplitude <= 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let live = true;

    const wander = () => {
      if (!live) return;
      const caught = Math.random() < 0.08;
      const target = caught
        ? Math.max(0.72, 1 - amplitude * (1.7 + Math.random()))
        : 1 - amplitude * (0.2 + Math.random() * 0.8);
      Animated.timing(glow, {
        toValue: target,
        duration: caught ? 75 : FILAMENT_WANDER_MS,
        easing: caught ? FILAMENT_COOL_EASE : FILAMENT_WARM_EASE,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !live) return;
        Animated.timing(glow, {
          toValue: 1 - amplitude * Math.random() * 0.45,
          duration: caught ? 170 : FILAMENT_WANDER_MS,
          easing: FILAMENT_WARM_EASE,
          useNativeDriver: true,
        }).start();
      });
      timer = setTimeout(wander, 650 + Math.round(Math.random() * 950));
    };

    timer = setTimeout(wander, 500 + Math.round(Math.random() * 700));
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      glow.stopAnimation();
    };
  }, [amplitude, glow, lit, reducedMotion]);

  return <Animated.View testID={testID} style={[style, { opacity: glow }]} />;
}
