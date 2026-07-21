import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import Svg, { Circle, Defs, G, Line, Rect, RadialGradient, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { walnut, amber } from '../../constants/ds6';
import { Plate } from './Plate';
import { playSound } from '../../utils/sound';
import type { Channel } from '../../types';

/**
 * The tuning dial — the DS-6's centerpiece, built to the faceplate spec.
 *
 * Concentric from the outside in: an amber breath of glow, the fine outer
 * knurl, the dial face carrying one station dot per channel, the coarse
 * inner knurl, the grip knob with its full-width thumb bar, and a single
 * slotted screw holding the whole affair to the chassis. Station plates
 * ride a uniform polar clearance outside the knurl. Everything scales
 * from the 620px reference drawing.
 */

interface DialProps {
  channels: Channel[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onTune: (index: number) => void;
  /** Edge of the square dial assembly, in px. */
  size: number;
}

const REF = 620; // the reference drawing's edge

function angleFor(index: number, count: number): number {
  // Stations ride from the top, clockwise, evenly spaced.
  return (index / count) * 360 - 90;
}

export function Dial({ channels, selectedIndex, onSelect, onTune, size }: DialProps) {
  const s = size / REF;
  const c = size / 2;
  const pointer = useRef(new Animated.Value(angleFor(selectedIndex, channels.length) + 90)).current;
  // Continuous pointer angle, so the needle always takes the short way
  // round the dial — 1 to 7 is one click back, not a full revolution.
  const angleRef = useRef(angleFor(selectedIndex, channels.length) + 90);

  const mounted = useRef(false);

  useEffect(() => {
    const target = angleFor(selectedIndex, channels.length) + 90;
    const currentMod = ((angleRef.current % 360) + 360) % 360;
    let delta = target - currentMod;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    angleRef.current += delta;
    Animated.timing(pointer, {
      toValue: angleRef.current,
      duration: 320,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    }).start();
    // The detent speaks on every wind, not on arrival at the page.
    if (mounted.current) playSound('detent');
    mounted.current = true;
  }, [selectedIndex, channels.length, pointer]);

  const rotation = pointer.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  // Radii from the reference drawing, scaled.
  const rKnurlOuter = 145 * s;
  const rKnurlInner = 133 * s;
  const rFace = 133 * s;
  const rDots = 112 * s;
  const rInnerKnurlOuter = 73 * s;
  const rInnerKnurlInner = 67 * s;
  const rInnerFace = 67 * s;
  const rGrip = 53 * s;
  // Plates keep their engraved size when the cabinet shrinks, so their
  // clearance off the knurl is absolute, not scaled — they must never
  // ride up onto the ring.
  const rPlates = Math.max(245 * s, rKnurlOuter + 95);
  const grip = rGrip * 2;

  const fineTicks = Array.from({ length: 60 }, (_, i) => (i / 60) * Math.PI * 2);
  const coarseTicks = Array.from({ length: 36 }, (_, i) => (i / 36) * Math.PI * 2);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="dialGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={amber.needle} stopOpacity={0.09} />
            <Stop offset="55%" stopColor={amber.needle} stopOpacity={0.05} />
            <Stop offset="100%" stopColor={amber.needle} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="dialFace" cx="44%" cy="36%" r="78%">
            <Stop offset="0%" stopColor="#2c1f12" />
            <Stop offset="100%" stopColor="#180f07" />
          </RadialGradient>
          <RadialGradient id="innerFace" cx="45%" cy="35%" r="75%">
            <Stop offset="0%" stopColor="#2b1d10" />
            <Stop offset="100%" stopColor="#170e07" />
          </RadialGradient>
          <RadialGradient id="gripFace" cx="40%" cy="30%" r="72%">
            <Stop offset="0%" stopColor="#3e2c18" />
            <Stop offset="100%" stopColor="#1e1309" />
          </RadialGradient>
        </Defs>

        {/* the amber breath around the works */}
        <Circle cx={c} cy={c} r={c} fill="url(#dialGlow)" />

        {/* fine outer knurl */}
        <G>
          {fineTicks.map((a, i) => (
            <Line
              key={i}
              x1={c + rKnurlInner * Math.cos(a)}
              y1={c + rKnurlInner * Math.sin(a)}
              x2={c + rKnurlOuter * Math.cos(a)}
              y2={c + rKnurlOuter * Math.sin(a)}
              stroke="rgba(241,229,207,0.15)"
              strokeWidth={3.6 * s}
            />
          ))}
        </G>

        {/* the dial face */}
        <Circle cx={c} cy={c} r={rFace} fill="url(#dialFace)" stroke="rgba(0,0,0,0.75)" strokeWidth={1} />

        {/* station dots, riding the face — one per channel, the live one lit */}
        {channels.map((ch, i) => {
          const a = (angleFor(i, channels.length) * Math.PI) / 180;
          const lit = i === selectedIndex;
          return (
            <G key={ch.id}>
              {lit && (
                <Circle cx={c + rDots * Math.cos(a)} cy={c + rDots * Math.sin(a)} r={9 * s} fill={amber.jewel} opacity={0.35} />
              )}
              <Circle
                cx={c + rDots * Math.cos(a)}
                cy={c + rDots * Math.sin(a)}
                r={4 * s}
                fill={lit ? amber.jewel : 'rgba(241,229,207,0.16)'}
              />
            </G>
          );
        })}

        {/* coarse inner knurl */}
        <G>
          {coarseTicks.map((a, i) => (
            <Line
              key={i}
              x1={c + rInnerKnurlInner * Math.cos(a)}
              y1={c + rInnerKnurlInner * Math.sin(a)}
              x2={c + rInnerKnurlOuter * Math.cos(a)}
              y2={c + rInnerKnurlOuter * Math.sin(a)}
              stroke="rgba(241,229,207,0.2)"
              strokeWidth={3.4 * s}
            />
          ))}
        </G>

        {/* inner face and grip knob */}
        <Circle cx={c} cy={c} r={rInnerFace} fill="url(#innerFace)" stroke={walnut.void} strokeWidth={1} />
        <Circle cx={c} cy={c} r={rGrip} fill="url(#gripFace)" stroke={walnut.void} strokeWidth={1} />
      </Svg>

      {/* the thumb bar — a full-width grip that winds with the tuning */}
      <Animated.View
        style={[
          styles.gripLayer,
          { left: c - rGrip, top: c - rGrip, width: grip, height: grip, transform: [{ rotate: rotation }] },
        ]}
        pointerEvents="none"
      >
        <Svg width={grip} height={grip} viewBox={`0 0 ${grip} ${grip}`}>
          <Defs>
            <SvgLinearGradient id="bar" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#140b04" />
              <Stop offset="28%" stopColor="#3b2a17" />
              <Stop offset="50%" stopColor="#54401f" />
              <Stop offset="76%" stopColor="#2a1a0c" />
              <Stop offset="100%" stopColor="#100803" />
            </SvgLinearGradient>
          </Defs>
          <Rect
            x={rGrip - 9 * s}
            y={8 * s}
            width={18 * s}
            height={grip - 16 * s}
            rx={9 * s}
            fill="url(#bar)"
            stroke="rgba(241,229,207,0.12)"
            strokeWidth={0.6}
          />
          {/* the jewel at the pointing end */}
          <Circle cx={rGrip} cy={16.5 * s} r={6.5 * s} fill={amber.jewel} opacity={0.35} />
          <Circle cx={rGrip} cy={16.5 * s} r={4.5 * s} fill={amber.jewel} />
          <Circle cx={rGrip - 1.5 * s} cy={15 * s} r={1.6 * s} fill={amber.glow} />
        </Svg>
      </Animated.View>

      {/* the one machine screw that holds the knob on — slotted, off-clock */}
      <View style={[styles.screwLayer, { left: c - 7 * s, top: c - 7 * s, width: 14 * s, height: 14 * s }]} pointerEvents="none">
        <Svg width={14 * s} height={14 * s} viewBox="0 0 14 14">
          <Defs>
            <RadialGradient id="dialScrew" cx="35%" cy="30%" r="70%">
              <Stop offset="0%" stopColor="#c9b48c" />
              <Stop offset="60%" stopColor="#5f4a2c" />
              <Stop offset="100%" stopColor="#2c1e0e" />
            </RadialGradient>
          </Defs>
          <Circle cx={7} cy={7} r={7} fill="url(#dialScrew)" />
          <G rotation={78} origin="7, 7">
            <Rect x={2} y={6.1} width={10} height={1.7} rx={0.8} fill="rgba(12,7,2,0.85)" />
            <Rect x={2.4} y={7.7} width={9.2} height={0.6} rx={0.3} fill="rgba(241,229,207,0.25)" />
          </G>
        </Svg>
      </View>

      {/* station plates on the polar clearance */}
      {channels.map((ch, i) => {
        const a = (angleFor(i, channels.length) * Math.PI) / 180;
        const px = c + rPlates * Math.cos(a);
        const py = c + rPlates * Math.sin(a);
        const selected = i === selectedIndex;
        return (
          // A wide centering box keeps the engraving on one line — an
          // absolutely-positioned plate near the cabinet's edge would
          // otherwise wrap its own name.
          <View key={ch.id} style={[styles.station, { left: px - 170, top: py, width: 340 }]} pointerEvents="box-none">
            {/* Percentage translate centers the plate on its polar point (RN >= 0.76). */}
            <View style={{ transform: [{ translateY: '-50%' }] } as never}>
              <Pressable onPress={() => (selected ? onTune(i) : onSelect(i))}>
                <Plate
                  kicker={`CHANNEL ${ch.number}`}
                  label={ch.name.toUpperCase()}
                  lit={selected}
                  kickerSize={8}
                  labelSize={12.5}
                />
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gripLayer: {
    position: 'absolute',
  },
  screwLayer: {
    position: 'absolute',
  },
  station: {
    position: 'absolute',
    alignItems: 'center',
  },
});
