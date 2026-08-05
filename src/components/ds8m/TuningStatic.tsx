import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, RadialGradient, Rect, Stop } from 'react-native-svg';
import { brass, fonts, walnut } from '../../constants/ds6';
import { STATIC_FPS } from '../../ui/motion';

/** One-line review switch: both candidates stay built and easy to compare. */
export const STATIC_CANDIDATE: 'prerendered' | 'procedural' = 'prerendered';

const COLS = 24;
const ROWS = 14;

function ProceduralSnow() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((value) => value + 1), Math.round(1000 / STATIC_FPS));
    return () => clearInterval(timer);
  }, []);

  const cells = useMemo(() => {
    let seed = (frame + 1) * 2654435761;
    return Array.from({ length: COLS * ROWS }, (_, index) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return { index, light: 62 + (seed % 142) };
    });
  }, [frame]);
  const dx = frame % 3 - 1;
  const dy = (frame * 2) % 3 - 1;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${COLS} ${ROWS}`} preserveAspectRatio="none">
      <G transform={`translate(${dx} ${dy})`}>
        {cells.map(({ index, light }) => (
          <Rect
            key={index}
            x={(index % COLS) - 1}
            y={Math.floor(index / COLS) - 1}
            width={1.08}
            height={1.08}
            fill={`rgb(${light},${light},${light})`}
          />
        ))}
      </G>
    </Svg>
  );
}

interface TuningStaticProps {
  error?: string | null;
}

/** The broken signal between detents. It is information, so reduced motion keeps it. */
export function TuningStatic({ error }: TuningStaticProps) {
  return (
    <View style={styles.static} pointerEvents="none">
      {STATIC_CANDIDATE === 'prerendered' ? (
        <Image
          source={require('../../../assets/static/tuning-static.gif')}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <ProceduralSnow />
      )}

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
