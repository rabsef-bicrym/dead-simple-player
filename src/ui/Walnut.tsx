import { Image, StyleSheet } from 'react-native';

/**
 * The cabinet's wood. The set has always been called walnut and painted as
 * a flat brown; this lays the figure of the veneer over that colour: rings,
 * fibre and open pores, drawn by `scripts/make-walnut-grain.mjs` as a tile
 * that repeats without a seam. It carries shade only, so the cabinet's own
 * light and colour show through it unchanged.
 *
 * It is a plain image behind the furniture. It is never laid over the
 * picture, and it takes no touches.
 */
const GRAIN = require('../../assets/textures/walnut-grain.png');

export function WalnutGrain({ opacity = 0.85 }: { opacity?: number }) {
  return (
    <Image
      source={GRAIN}
      resizeMode="repeat"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.grain, { opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  grain: {
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
});
