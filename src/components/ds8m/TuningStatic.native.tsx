import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { DSPStaticNativeView } from '../../../modules/dsp-picture';
import { TuningOverlay } from './TuningOverlay';
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

      <TuningOverlay error={error} />
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
});
