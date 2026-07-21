import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop } from 'react-native-svg';
import { walnut, brass, amber, fonts } from '../../constants/ds6';
import { Plate } from './Plate';
import type { Channel } from '../../types';

/**
 * The tuning dial — the DS-6's centerpiece.
 *
 * A knurled knob with a brass pointer; the station plates ride a uniform
 * circle around it by polar math. The selected station is backlit; the
 * pointer winds to it with a spring the knob would forgive.
 */

interface DialProps {
  channels: Channel[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onTune: (index: number) => void;
}

const KNOB = 220;
const RING = KNOB + 46;

function angleFor(index: number, count: number): number {
  // Stations ride from the top, clockwise, evenly spaced.
  return (index / count) * 360 - 90;
}

export function Dial({ channels, selectedIndex, onSelect, onTune }: DialProps) {
  const { width, height } = useWindowDimensions();
  const pointer = useRef(new Animated.Value(angleFor(selectedIndex, channels.length) + 90)).current;

  useEffect(() => {
    Animated.timing(pointer, {
      toValue: angleFor(selectedIndex, channels.length) + 90,
      duration: 320,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    }).start();
  }, [selectedIndex, channels.length, pointer]);

  const radius = Math.min(width, height) * 0.335;
  const cx = width / 2;
  const cy = height / 2 - 8;

  const rotation = pointer.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* The knob */}
      <View style={[styles.knobWrap, { left: cx - RING / 2, top: cy - RING / 2 }]}>
        <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
          <Defs>
            <RadialGradient id="knobFace" cx="44%" cy="36%" r="80%">
              <Stop offset="0%" stopColor="#2c1f12" />
              <Stop offset="78%" stopColor="#180f07" />
              <Stop offset="100%" stopColor={walnut.void} />
            </RadialGradient>
          </Defs>
          {/* knurl ring — the grip your fingers would know */}
          <G>
            {Array.from({ length: 72 }, (_, i) => {
              const a = (i / 72) * Math.PI * 2;
              const r0 = RING / 2 - 20;
              const r1 = RING / 2 - 4;
              return (
                <Line
                  key={i}
                  x1={RING / 2 + r0 * Math.cos(a)}
                  y1={RING / 2 + r0 * Math.sin(a)}
                  x2={RING / 2 + r1 * Math.cos(a)}
                  y2={RING / 2 + r1 * Math.sin(a)}
                  stroke={i % 2 ? 'rgba(241,229,207,0.13)' : 'rgba(0,0,0,0.4)'}
                  strokeWidth={2.4}
                />
              );
            })}
          </G>
          <Circle cx={RING / 2} cy={RING / 2} r={KNOB / 2} fill="url(#knobFace)" />
          <Circle cx={RING / 2} cy={RING / 2} r={KNOB / 2} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={1.5} />
        </Svg>

        {/* pointer — a brass needle with an amber tip, wound by the spring */}
        <Animated.View style={[styles.pointerLayer, { transform: [{ rotate: rotation }] }]} pointerEvents="none">
          <View style={styles.pointerArm} />
          <View style={styles.pointerTip} />
        </Animated.View>
      </View>

      {/* Station plates on the polar circle */}
      {channels.map((ch, i) => {
        const a = (angleFor(i, channels.length) * Math.PI) / 180;
        const px = cx + radius * Math.cos(a);
        const py = cy + radius * Math.sin(a);
        const selected = i === selectedIndex;
        return (
          <Pressable
            key={ch.id}
            onPress={() => (selected ? onTune(i) : onSelect(i))}
            style={[styles.station, { left: px, top: py }]}
          >
            {/* Percentage translate centers the plate on its polar point (RN >= 0.76). */}
            <View style={{ transform: [{ translateX: '-50%' }, { translateY: '-50%' }] } as never}>
              <Plate
                kicker={`CHANNEL ${ch.number}`}
                label={ch.name.toUpperCase()}
                lit={selected}
                kickerSize={8}
                labelSize={13}
              />
            </View>
          </Pressable>
        );
      })}

      {/* Station dots on the ring between knob and plates */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {channels.map((ch, i) => {
          const a = (angleFor(i, channels.length) * Math.PI) / 180;
          const r = radius * 0.58;
          return (
            <Circle
              key={ch.id}
              cx={cx + r * Math.cos(a)}
              cy={cy + r * Math.sin(a)}
              r={i === selectedIndex ? 5 : 3.2}
              fill={i === selectedIndex ? amber.jewel : 'rgba(241,229,207,0.18)'}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  knobWrap: {
    position: 'absolute',
    width: RING,
    height: RING,
    shadowColor: amber.needle,
    shadowOpacity: 0.08,
    shadowRadius: 70,
    shadowOffset: { width: 0, height: 0 },
  },
  pointerLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: RING,
    height: RING,
    alignItems: 'center',
  },
  pointerArm: {
    position: 'absolute',
    top: RING / 2 - KNOB / 2 + 14,
    width: 5,
    height: KNOB / 2 - 14,
    borderRadius: 2.5,
    backgroundColor: brass.mid,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.5)',
  },
  pointerTip: {
    position: 'absolute',
    top: RING / 2 - KNOB / 2 + 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: amber.jewel,
    shadowColor: amber.glow,
    shadowOpacity: 0.9,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  station: {
    position: 'absolute',
  },
});
