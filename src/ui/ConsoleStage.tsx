import { createContext, useContext, type ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useCabinet } from '../hooks/useCabinet';
import { consoleMetrics, stageTransform, type ConsoleMetrics } from './consoleScale';

/**
 * The console's one layout boundary.
 *
 * Everything the console draws above the picture stands on this stage. The
 * stage is laid out in the cabinet's logical space (`consoleScale.ts`) and
 * enlarged as a single piece to fill the display, so a television shows the
 * 1440 by 900 drawing bigger rather than the same drawing lost in a wall.
 *
 * Furniture on the stage must not ask the window how big it is: the window
 * answers in display px and the furniture would then be enlarged twice. It
 * asks `useConsoleMetrics()` instead.
 *
 * Where the stage does nothing, it IS nothing:
 * - On the traveling set (phone) the children are returned as they came.
 * - On native the children are returned as they came. No iPad reaches the
 *   reference size, so the rule would answer 1 anyway; and a scaled native
 *   view is rasterised at its unscaled size and then stretched, which blurs
 *   type. The enlargement is a browser affair, where text is re-set crisp at
 *   the final size and hit-testing follows the transform by itself.
 * - On the web console at scale 1 the wrapper stays (so crossing the
 *   threshold while resizing a window does not remount the cabinet) but it
 *   carries no transform and no size of its own: it is the same box as the
 *   screen. It never has a background; the picture is beneath it.
 */

const StageContext = createContext<ConsoleMetrics | null>(null);

/**
 * The space console furniture lays itself out in. On a stage, the logical
 * space; anywhere else (native, the phone, a test), the window as it is.
 */
export function useConsoleMetrics(): ConsoleMetrics {
  const staged = useContext(StageContext);
  const { width, height } = useWindowDimensions();
  return staged ?? consoleMetrics(width, height, false);
}

interface ConsoleStageProps {
  children: ReactNode;
  /**
   * For a screen whose furniture is laid out in flow rather than pinned to
   * the screen's edges: the stage then brings its own full-size seat.
   */
  standalone?: boolean;
}

export function ConsoleStage({ children, standalone = false }: ConsoleStageProps) {
  const { isPhone, width, height } = useCabinet();
  if (Platform.OS !== 'web' || isPhone) return <>{children}</>;

  const metrics = consoleMetrics(width, height);
  const stage = (
    <View
      pointerEvents="box-none"
      style={
        metrics.scale === 1
          ? styles.rest
          : [styles.enlarged, { width: metrics.width, height: metrics.height, transform: stageTransform(metrics) }]
      }
    >
      {children}
    </View>
  );

  return (
    <StageContext.Provider value={metrics}>
      {standalone ? <View style={styles.seat}>{stage}</View> : stage}
    </StageContext.Provider>
  );
}

const styles = StyleSheet.create({
  rest: {
    ...StyleSheet.absoluteFillObject,
  },
  enlarged: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  seat: {
    flex: 1,
  },
});
