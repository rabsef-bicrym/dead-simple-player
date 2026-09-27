import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { DSPStaticNativeView } from '../../../modules/dsp-picture';
import { brass, fonts, walnut } from '../../constants/ds6';
import { traceEvent } from '../../services/tuneTrace';

interface TuningStaticProps {
  error?: string | null;
}

/**
 * The broken signal between detents. It is information, so reduced motion
 * keeps it (R31).
 *
 * The snow is modules/dsp-picture's DSPStaticView: one CALayer whose
 * contentsRect is a discrete keyframe animation over a runtime noise tile,
 * evaluated by the render server every refresh (R3) — no per-frame code path
 * that can stall, no shader, no uniform that grows, so a flat field is
 * impossible by construction (H-J, docs/native-witness.md §9). Its rows say
 * so: `static mount` → `S live n=1` (the animation started) → `S boil n=1`
 * (the render server is advancing it) → … → `static unmount` (the real
 * unmount, FF-12). Where the module is not linked the field is the seat's
 * black (FF-16), never grey, with the plate over it.
 */
export function TuningStatic({ error }: TuningStaticProps) {
  useEffect(() => {
    traceEvent('static mount');
    return () => traceEvent('static unmount');
  }, []);

  return (
    <View style={styles.static} pointerEvents="none">
      {DSPStaticNativeView ? (
        <DSPStaticNativeView
          style={StyleSheet.absoluteFill}
          grainPoints={2}
          onStaticLive={(e) => traceEvent('S live', `n=${e.nativeEvent.n}`, { nativeT: e.nativeEvent.t })}
          onStaticBoil={(e) => traceEvent('S boil', `n=${e.nativeEvent.n}`, { nativeT: e.nativeEvent.t })}
        />
      ) : null}

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
    // FF-16: the seat colour. If the snow ever fails, the failure reads as
    // "the set is on, no picture, the plate says A MOMENT, PLEASE" — never a
    // grey nobody can place.
    backgroundColor: '#000',
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
