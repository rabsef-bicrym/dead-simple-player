import { StyleSheet, Text, View } from 'react-native';
import {
  Canvas,
  Fill,
  Shader,
  Skia,
  useClock,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { brass, fonts, walnut } from '../../constants/ds6';

const STATIC_EFFECT = (() => {
  const effect = Skia.RuntimeEffect.Make(`
    uniform float time;

    half4 main(vec2 xy) {
      vec2 grain = floor(xy / 2.0);
      float n = fract(sin(dot(grain + time * 337.0, vec2(12.9898, 78.233))) * 43758.5453);
      float v = 0.14 + n * 0.71;
      return half4(v, v, v, 1.0);
    }
  `);
  if (!effect) {
    throw new Error('Could not compile the tuning-static shader');
  }
  return effect;
})();

function NativeStatic() {
  const clock = useClock();
  const uniforms = useDerivedValue(() => ({ time: clock.value }));

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader source={STATIC_EFFECT} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}

interface TuningStaticProps {
  error?: string | null;
}

/** The broken signal between detents. It is information, so reduced motion keeps it. */
export function TuningStatic({ error }: TuningStaticProps) {
  return (
    <View style={styles.static} pointerEvents="none">
      <NativeStatic />

      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="staticVignette" cx="50%" cy="48%" rx="72%" ry="92%">
            <Stop offset="0%" stopColor="#000" stopOpacity={0.02} />
            <Stop offset="58%" stopColor="#000" stopOpacity={0.08} />
            <Stop offset="100%" stopColor="#000" stopOpacity={0.5} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#staticVignette)" />
      </Svg>

      <View style={styles.plateShell}>
        <View style={styles.plate}>
          <View style={[styles.screw, styles.screwLeft]} />
          <View style={[styles.screw, styles.screwRight]} />
          <Text style={styles.plateText}>
            {error ? 'THE SIGNAL WILL NOT JOIN' : 'A MOMENT, PLEASE'}
          </Text>
          {error ? <Text style={styles.detail} numberOfLines={2}>{error}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  static: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#777',
  },
  plateShell: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plate: {
    minWidth: 196,
    maxWidth: '78%',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 3,
    backgroundColor: '#24180c',
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  plateText: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 2.8,
    color: brass.bright,
    textAlign: 'center',
  },
  detail: {
    fontFamily: fonts.speech,
    fontSize: 10.5,
    lineHeight: 13,
    color: brass.muted,
    textAlign: 'center',
  },
  screw: {
    position: 'absolute',
    top: '50%',
    width: 5,
    height: 5,
    marginTop: -2.5,
    borderRadius: 2.5,
    borderWidth: 0.5,
    borderColor: brass.light,
    backgroundColor: brass.shadow,
  },
  screwLeft: { left: 8 },
  screwRight: { right: 8 },
});
