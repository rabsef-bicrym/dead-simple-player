import { useWindowDimensions } from 'react-native';

/**
 * Which cabinet is this display?
 *
 * The DS-8 is the console — laptop, television, anything with room for
 * the full dial. The DS-8/M is the traveling set: phone glass, where
 * nothing shrinks and everything re-cabinets. A display whose short
 * side is under 500 points is the traveling set.
 */
export function useCabinet() {
  const { width, height } = useWindowDimensions();
  const isPhone = Math.min(width, height) < 500;
  return { isPhone, landscape: width >= height, width, height };
}
