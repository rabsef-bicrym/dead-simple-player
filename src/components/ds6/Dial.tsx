import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Rect, RadialGradient, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { walnut, brass, amber, cream, fonts } from '../../constants/ds6';
import { playSound } from '../../utils/sound';
import type { Channel } from '../../types';

/**
 * The tuning dial — the DS-6's centerpiece, built to the faceplate spec.
 *
 * Concentric from the outside in: an amber breath of glow, the shadow the
 * works cast on the walnut, a turned brass collar, the fine outer knurl,
 * the dial face carrying one station dot per channel, the coarse inner
 * knurl, the grip knob with its full-width thumb bar, and a single slotted
 * screw holding the whole affair to the chassis. The light is the cabinet's
 * own, from up and to the left: every edge that faces it is bright, every
 * edge that turns away is in shade, and the face carries the two opposed
 * fans of light a lathe leaves on spun metal. Fixed-width
 * channel numerals ride each detent outside the knurl, so their anchors
 * remain optically equidistant. Everything scales from the 620px
 * reference drawing.
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


/** One slice of a ring, from angle a0 to a1 (radians), between two radii. */
function ringSlice(c: number, rInner: number, rOuter: number, a0: number, a1: number): string {
  const x = (r: number, a: number) => (c + r * Math.cos(a)).toFixed(2);
  const y = (r: number, a: number) => (c + r * Math.sin(a)).toFixed(2);
  return `M${x(rInner, a0)} ${y(rInner, a0)} L${x(rOuter, a0)} ${y(rOuter, a0)} `
    + `A${rOuter.toFixed(2)} ${rOuter.toFixed(2)} 0 0 1 ${x(rOuter, a1)} ${y(rOuter, a1)} `
    + `L${x(rInner, a1)} ${y(rInner, a1)} `
    + `A${rInner.toFixed(2)} ${rInner.toFixed(2)} 0 0 0 ${x(rInner, a0)} ${y(rInner, a0)} Z`;
}

/**
 * The fan of light on spun metal. A lathe leaves fine circular scratches,
 * and they throw the lamp back along one diameter only: brightest on the
 * axis toward the light, falling away to nothing on either side. Drawn as
 * narrow slices, each a little dimmer than the last.
 */
const SHEEN_STEP = 2; // degrees per slice
function sheenFan(centerDeg: number, halfSpreadDeg: number, peak: number): { a0: number; a1: number; opacity: number }[] {
  const slices: { a0: number; a1: number; opacity: number }[] = [];
  for (let d = -halfSpreadDeg; d < halfSpreadDeg; d += SHEEN_STEP) {
    const mid = d + SHEEN_STEP / 2;
    const fall = Math.cos((mid / halfSpreadDeg) * (Math.PI / 2));
    slices.push({
      a0: ((centerDeg + d) * Math.PI) / 180,
      // The least overlap that closes the seam; more shows as a bright spoke.
      a1: ((centerDeg + d + SHEEN_STEP + 0.06) * Math.PI) / 180,
      opacity: peak * fall * fall,
    });
  }
  return slices;
}
/** Toward the cabinet's light, and the answering fan across the face. */
const LIGHT_DEG = -128;
const FACE_SHEEN = [...sheenFan(LIGHT_DEG, 38, 0.085), ...sheenFan(LIGHT_DEG + 180, 34, 0.05)];
const GRIP_SHEEN = [...sheenFan(LIGHT_DEG, 44, 0.11), ...sheenFan(LIGHT_DEG + 180, 40, 0.06)];

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
  const rCollarOuter = 158 * s;
  const rKnurlOuter = 145 * s;
  const rKnurlInner = 133 * s;
  const rFace = 133 * s;
  const rDots = 112 * s;
  const rInnerKnurlOuter = 73 * s;
  const rInnerKnurlInner = 67 * s;
  const rInnerFace = 67 * s;
  const rGrip = 53 * s;
  // Number boxes are fixed-width and centered on their polar anchors;
  // unlike name plaques, their contents can never disturb the spacing.
  const rNumbers = Math.max(190 * s, rCollarOuter + 26);
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
          <RadialGradient id="gripFace" cx="38%" cy="28%" r="78%">
            <Stop offset="0%" stopColor="#4a3519" />
            <Stop offset="55%" stopColor="#2a1c0d" />
            <Stop offset="100%" stopColor="#150c05" />
          </RadialGradient>
          {/* the shadow the works cast on the wood, falling away from the light */}
          <RadialGradient id="dialShadow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#000000" stopOpacity={0.62} />
            <Stop offset="80%" stopColor="#000000" stopOpacity={0.5} />
            <Stop offset="100%" stopColor="#000000" stopOpacity={0} />
          </RadialGradient>
          {/* turned brass, lit from up-left, with the rebound light a round edge picks up below */}
          <SvgLinearGradient id="collar" x1="14%" y1="8%" x2="86%" y2="92%">
            <Stop offset="0%" stopColor={brass.etch} />
            <Stop offset="16%" stopColor={brass.light} />
            <Stop offset="42%" stopColor={brass.shadow} />
            <Stop offset="72%" stopColor="#2c1e0e" />
            <Stop offset="90%" stopColor={brass.shadow} />
            <Stop offset="100%" stopColor={brass.mid} />
          </SvgLinearGradient>
          {/* the same light across a ring of knurling: bright crowns above, shade below */}
          <SvgLinearGradient id="knurlLight" x1="14%" y1="8%" x2="86%" y2="92%">
            <Stop offset="0%" stopColor={cream} stopOpacity={0.2} />
            <Stop offset="45%" stopColor={cream} stopOpacity={0} />
            <Stop offset="100%" stopColor="#000000" stopOpacity={0.5} />
          </SvgLinearGradient>
          <SvgLinearGradient id="rimLight" x1="14%" y1="8%" x2="86%" y2="92%">
            <Stop offset="0%" stopColor={cream} stopOpacity={0.55} />
            <Stop offset="40%" stopColor={cream} stopOpacity={0} />
            <Stop offset="100%" stopColor={cream} stopOpacity={0.12} />
          </SvgLinearGradient>
        </Defs>

        {/* the amber breath around the works */}
        <Circle cx={c} cy={c} r={c} fill="url(#dialGlow)" />

        {/* the works stand proud of the walnut and shade it, down and to the right */}
        <Circle cx={c + 5 * s} cy={c + 8 * s} r={rCollarOuter + 14 * s} fill="url(#dialShadow)" />

        {/* the brass collar the dial turns in */}
        <Circle cx={c} cy={c} r={rCollarOuter} fill="url(#collar)" />
        <Circle cx={c} cy={c} r={rCollarOuter - 0.5} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={1} />
        <Circle cx={c} cy={c} r={rCollarOuter - 2.2 * s} fill="none" stroke="url(#rimLight)" strokeWidth={1.1 * s} />
        {/* its inner wall, in shade, where the knurled ring sits down into it */}
        <Circle cx={c} cy={c} r={rKnurlOuter + 2.5 * s} fill="#0f0803" />

        {/* fine outer knurl: a lit flank and a shaded flank to every ridge */}
        <Circle cx={c} cy={c} r={(rKnurlOuter + rKnurlInner) / 2} fill="none" stroke="#231709" strokeWidth={rKnurlOuter - rKnurlInner} />
        <G>
          {fineTicks.map((a, i) => (
            <Line
              key={i}
              x1={c + rKnurlInner * Math.cos(a)}
              y1={c + rKnurlInner * Math.sin(a)}
              x2={c + rKnurlOuter * Math.cos(a)}
              y2={c + rKnurlOuter * Math.sin(a)}
              stroke="rgba(241,229,207,0.26)"
              strokeWidth={2.6 * s}
            />
          ))}
          {fineTicks.map((a, i) => {
            const b = a + Math.PI / 60;
            return (
              <Line
                key={`s${i}`}
                x1={c + rKnurlInner * Math.cos(b)}
                y1={c + rKnurlInner * Math.sin(b)}
                x2={c + rKnurlOuter * Math.cos(b)}
                y2={c + rKnurlOuter * Math.sin(b)}
                stroke="rgba(0,0,0,0.5)"
                strokeWidth={2.6 * s}
              />
            );
          })}
        </G>
        <Circle cx={c} cy={c} r={(rKnurlOuter + rKnurlInner) / 2} fill="none" stroke="url(#knurlLight)" strokeWidth={rKnurlOuter - rKnurlInner} />

        {/* the dial face */}
        <Circle cx={c} cy={c} r={rFace} fill="url(#dialFace)" stroke="rgba(0,0,0,0.75)" strokeWidth={1} />
        {/* the lathe's fine rings, and the fans of light they throw back */}
        {[124, 118, 106, 100, 94, 88, 82].map((r) => (
          <Circle key={r} cx={c} cy={c} r={r * s} fill="none" stroke="rgba(241,229,207,0.035)" strokeWidth={0.7} />
        ))}
        {FACE_SHEEN.map((f, i) => (
          <Path key={i} d={ringSlice(c, rInnerKnurlOuter, rFace - 1, f.a0, f.a1)} fill={cream} opacity={f.opacity} />
        ))}
        <Circle cx={c} cy={c} r={rFace - 1.2 * s} fill="none" stroke="url(#rimLight)" strokeWidth={0.9 * s} opacity={0.5} />

        {/* station dots, riding the face — one per channel, the live one lit */}
        {channels.map((ch, i) => {
          const a = (angleFor(i, channels.length) * Math.PI) / 180;
          const lit = i === selectedIndex;
          return (
            <G key={ch.id}>
              {lit && (
                <Circle cx={c + rDots * Math.cos(a)} cy={c + rDots * Math.sin(a)} r={9 * s} fill={amber.jewel} opacity={0.35} />
              )}
              {lit ? (
                <>
                  <Circle cx={c + rDots * Math.cos(a)} cy={c + rDots * Math.sin(a)} r={4.4 * s} fill={amber.jewel} />
                  <Circle cx={c + rDots * Math.cos(a) - 1.3 * s} cy={c + rDots * Math.sin(a) - 1.4 * s} r={1.5 * s} fill={amber.glow} />
                </>
              ) : (
                <>
                  {/* an unlit station is a drilled seat: dark within, its far lip catching the light */}
                  <Circle cx={c + rDots * Math.cos(a) + 0.6 * s} cy={c + rDots * Math.sin(a) + 0.8 * s} r={4.2 * s} fill="rgba(241,229,207,0.2)" />
                  <Circle cx={c + rDots * Math.cos(a)} cy={c + rDots * Math.sin(a)} r={4 * s} fill="#0e0803" />
                  <Circle cx={c + rDots * Math.cos(a)} cy={c + rDots * Math.sin(a)} r={2 * s} fill="rgba(241,229,207,0.1)" />
                </>
              )}
            </G>
          );
        })}

        {/* coarse inner knurl */}
        <Circle cx={c + 2 * s} cy={c + 4 * s} r={rInnerKnurlOuter + 5 * s} fill="rgba(0,0,0,0.45)" />
        <Circle cx={c} cy={c} r={rInnerKnurlOuter} fill="#1f1408" />
        <G>
          {coarseTicks.map((a, i) => (
            <Line
              key={i}
              x1={c + rInnerKnurlInner * Math.cos(a)}
              y1={c + rInnerKnurlInner * Math.sin(a)}
              x2={c + rInnerKnurlOuter * Math.cos(a)}
              y2={c + rInnerKnurlOuter * Math.sin(a)}
              stroke="rgba(241,229,207,0.3)"
              strokeWidth={2.4 * s}
            />
          ))}
          {coarseTicks.map((a, i) => {
            const b = a + Math.PI / 36;
            return (
              <Line
                key={`s${i}`}
                x1={c + rInnerKnurlInner * Math.cos(b)}
                y1={c + rInnerKnurlInner * Math.sin(b)}
                x2={c + rInnerKnurlOuter * Math.cos(b)}
                y2={c + rInnerKnurlOuter * Math.sin(b)}
                stroke="rgba(0,0,0,0.5)"
                strokeWidth={2.4 * s}
              />
            );
          })}
        </G>
        <Circle cx={c} cy={c} r={(rInnerKnurlOuter + rInnerKnurlInner) / 2} fill="none" stroke="url(#knurlLight)" strokeWidth={rInnerKnurlOuter - rInnerKnurlInner} />

        {/* inner face and grip knob */}
        <Circle cx={c} cy={c} r={rInnerFace} fill="url(#innerFace)" stroke={walnut.void} strokeWidth={1} />
        <Circle cx={c} cy={c} r={rGrip} fill="url(#gripFace)" stroke={walnut.void} strokeWidth={1} />
        {GRIP_SHEEN.map((f, i) => (
          <Path key={i} d={ringSlice(c, 9 * s, rGrip - 1, f.a0, f.a1)} fill={cream} opacity={f.opacity} />
        ))}
        <Circle cx={c} cy={c} r={rGrip - 1.4 * s} fill="none" stroke="url(#rimLight)" strokeWidth={1 * s} opacity={0.7} />
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

      {/* fixed-width channel numerals at the detents */}
      {channels.map((ch, i) => {
        const a = (angleFor(i, channels.length) * Math.PI) / 180;
        const px = c + rNumbers * Math.cos(a);
        const py = c + rNumbers * Math.sin(a);
        const selected = i === selectedIndex;
        return (
          <Pressable
            key={ch.id}
            accessibilityRole="button"
            accessibilityLabel={`Channel ${ch.number}, ${ch.name}`}
            onPress={() => (selected ? onTune(i) : onSelect(i))}
            style={[styles.channelNumberHit, { left: px - 28, top: py - 22 }]}
          >
            <Text style={[styles.channelNumber, selected && styles.channelNumberSelected]}>{ch.number}</Text>
          </Pressable>
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
  channelNumberHit: {
    position: 'absolute',
    width: 56,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelNumber: {
    width: 56,
    textAlign: 'center',
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 22,
    lineHeight: 28,
    fontVariant: ['tabular-nums'],
    color: brass.light,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 1 },
  },
  channelNumberSelected: {
    color: amber.glow,
    textShadowColor: amber.jewel,
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
});
