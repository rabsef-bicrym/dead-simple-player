import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing } from 'react-native';

/**
 * One set of clocks for the cabinet. Components choose a mechanism from here;
 * they do not invent local durations or easing curves.
 */
export const STAMP_MS = 120;
export const STAMP_STAGGER_MS = 35;
export const FLASH_STAMP_MS = 100;
export const FLASH_DWELL_MS = 2500;
export const FLASH_COOL_MS = 400;

export const BLOOM_RAMP_MS = 250;
export const REGISTER_LINKAGE_MS = 280;
export const GEAR_NEUTRAL_MS = 90;
export const GEAR_CROSSBAR_MS = 110;

export const ROLLER_DOWN_MS = 320;
export const ROLLER_UP_MS = 260;
export const ROLLER_SETTLE_MS = 42;

export const COLLAPSE_VERTICAL_MS = 180;
export const COLLAPSE_LINE_TO_DOT_MS = 80;
export const COLLAPSE_COOL_MS = 90;
export const COLLAPSE_MS = COLLAPSE_VERTICAL_MS + COLLAPSE_LINE_TO_DOT_MS + COLLAPSE_COOL_MS;

export const PROJECTION_DIM_MS = 200;
export const PROJECTION_FOCUS_MS = 150;
export const PROJECTION_RETURN_MS = 150;
export const SERVICE_DOOR_MS = 260;

export const LAMP_WARM_MS = 420;
export const LAMP_COOL_MS = 120;
export const FILAMENT_WANDER_MS = 420;
export const STATIC_FPS = 12;

export const MECHANICAL_EASE_OUT = Easing.bezier(0.18, 0.78, 0.22, 1);
export const ROLLER_RELEASE_EASE = Easing.bezier(0.16, 0.76, 0.18, 1);
export const ROLLER_REWIND_EASE = Easing.bezier(0.28, 0.72, 0.3, 1);
export const FILAMENT_WARM_EASE = Easing.bezier(0.42, 0, 0.72, 1);
export const FILAMENT_COOL_EASE = Easing.bezier(0.3, 0, 0.82, 0.32);

export function motionDuration(duration: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : duration;
}

/** OS reduced-motion is binding: decorative mechanisms collapse to cuts. */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (live) setReducedMotion(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}
