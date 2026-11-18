/**
 * The console's scale.
 *
 * The console cabinet was drawn at 1440 by 900. On a living-room television
 * the same drawing, left at its drawn size, floats in emptiness and cannot be
 * read from the sofa. So the cabinet is treated as ONE composed object: the
 * whole face is laid out in a logical space no larger than a laptop's and
 * then enlarged as a piece, type, plates, gaps and rows together. Nothing in
 * the cabinet multiplies its own sizes; the boundary is `ConsoleStage`, and
 * this file is the arithmetic behind it.
 *
 * Pure. No platform, no layout pass.
 */

/** The size the console was drawn at. */
export const CONSOLE_REFERENCE = { width: 1440, height: 900 } as const;

/** A 3840 by 2160 panel is the reference drawing 2.4 times over; nothing is enlarged past that. */
export const CONSOLE_MAX_SCALE = 2.4;

/**
 * The composition never spreads wider than the picture it serves: 16 by 9,
 * and never less than the 1600 a television gives the 900-high drawing. On an
 * ultrawide display the columns stay together and the surplus becomes margin.
 */
const COMPOSITION_ASPECT = 16 / 9;
const COMPOSITION_MIN_CAP = 1600;

/**
 * How many times the drawn cabinet is enlarged on a viewport of this size.
 * Exactly 1 on the reference laptop and on anything smaller; the cabinet is
 * never reduced, because a smaller display re-lays-out instead.
 */
export function consoleScale(viewportWidth: number, viewportHeight: number): number {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return 1;
  const fit = Math.min(
    viewportWidth / CONSOLE_REFERENCE.width,
    viewportHeight / CONSOLE_REFERENCE.height,
  );
  return Math.min(CONSOLE_MAX_SCALE, Math.max(1, fit));
}

export interface ConsoleMetrics {
  /** The enlargement applied at the stage. 1 means no stage transform at all. */
  scale: number;
  /** The space the cabinet lays itself out in, before enlargement. */
  width: number;
  height: number;
  /**
   * Margin, in logical px, each side of the composition on a display wider
   * than the composition may spread. Backgrounds still run edge to edge;
   * furniture adds this to its side padding.
   */
  gutter: number;
}

/**
 * The logical space for a viewport. `scalable: false` is the native path and
 * the path outside a stage: the scale is 1 and the logical space IS the
 * viewport, which is exactly how the cabinet was laid out before this rule.
 */
export function consoleMetrics(
  viewportWidth: number,
  viewportHeight: number,
  scalable = true,
): ConsoleMetrics {
  const scale = scalable ? consoleScale(viewportWidth, viewportHeight) : 1;
  let width = viewportWidth;
  let height = viewportHeight;
  if (scale > 1) {
    // Below the ceiling one axis lands exactly on the reference, so take it
    // from there rather than divide and inherit a hair of float error.
    const heightBound = viewportHeight / CONSOLE_REFERENCE.height
      <= viewportWidth / CONSOLE_REFERENCE.width;
    if (scale >= CONSOLE_MAX_SCALE) {
      width = viewportWidth / scale;
      height = viewportHeight / scale;
    } else if (heightBound) {
      height = CONSOLE_REFERENCE.height;
      width = (viewportWidth * CONSOLE_REFERENCE.height) / viewportHeight;
    } else {
      width = CONSOLE_REFERENCE.width;
      height = (viewportHeight * CONSOLE_REFERENCE.width) / viewportWidth;
    }
  }
  const cap = Math.max(COMPOSITION_MIN_CAP, height * COMPOSITION_ASPECT);
  // Under half a px is float dust from the division, not a margin.
  const spare = (width - cap) / 2;
  const gutter = spare < 0.5 ? 0 : spare;
  return { scale, width, height, gutter };
}

/**
 * The transform that enlarges a logical-size stage, pinned at the viewport's
 * top-left corner, to fill the viewport. Views scale about their centre, so
 * the stage is first carried out by half of what it is about to grow.
 */
export function stageTransform(
  metrics: ConsoleMetrics,
): [{ translateX: number }, { translateY: number }, { scale: number }] {
  const { scale, width, height } = metrics;
  return [
    { translateX: (width * (scale - 1)) / 2 },
    { translateY: (height * (scale - 1)) / 2 },
    { scale },
  ];
}
