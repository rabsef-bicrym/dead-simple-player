import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, amber, cream, fonts, plateTracking } from '../../constants/ds6';
import { timeToProse } from '../../utils/prose';
import type { Channel, Programme } from '../../types';

/**
 * Tune-in flash — the channel plate, per the 7b drawing.
 *
 * On tuning, a stamped walnut plate rises top-left over a breath of
 * vignette: the live jewel, the channel's tracked kicker, the station
 * name in Besley, and what you've arrived into — "Free for All · until
 * eight o'clock." The whole affair fades once the picture has your
 * attention.
 */

interface FlashProps {
  channel: Channel;
  nowPlaying?: Programme;
  /** The traveling set's plate (10f) — nearer the corner, a size down. */
  compact?: boolean;
}

function Screw() {
  return <View style={styles.screw} />;
}

export function Flash({ channel, nowPlaying, compact = false }: FlashProps) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* the vignette — the cabinet leans in for a moment */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="flashVignette" cx="50%" cy="50%" rx="80%" ry="100%">
            <Stop offset="0%" stopColor="#120a05" stopOpacity={0} />
            <Stop offset="55%" stopColor="#120a05" stopOpacity={0} />
            <Stop offset="100%" stopColor="#120a05" stopOpacity={0.5} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#flashVignette)" />
      </Svg>

      <View style={[styles.shell, compact && styles.shellCompact]}>
        <LinearGradient colors={[walnut.grain, '#231507']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[styles.face, compact && styles.faceCompact]}>
          <View style={styles.kickerRow}>
            <View style={styles.jewel} />
            <Text style={[styles.kicker, compact && styles.kickerCompact]}>CHANNEL {channel.number}</Text>
          </View>
          <Text style={[styles.name, compact && styles.nameCompact]}>{channel.name.toUpperCase()}</Text>
          {nowPlaying && (
            <Text style={[styles.arriving, compact && styles.arrivingCompact]} numberOfLines={1}>
              {nowPlaying.title} · until {timeToProse(nowPlaying.stop)}
            </Text>
          )}
          <View style={[styles.screwWrap, styles.screwLeft]}><Screw /></View>
          <View style={[styles.screwWrap, styles.screwRight]}><Screw /></View>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 40,
    top: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: walnut.void,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  shellCompact: {
    left: 26,
    top: 26,
  },
  face: {
    borderRadius: 3,
    paddingVertical: 14,
    paddingHorizontal: 34,
  },
  faceCompact: {
    paddingVertical: 11,
    paddingHorizontal: 26,
  },
  kickerCompact: {
    fontSize: 8.5,
    letterSpacing: 2.6,
  },
  nameCompact: {
    fontSize: 23,
    letterSpacing: plateTracking(23) * 0.8,
    marginTop: 6,
  },
  arrivingCompact: {
    fontSize: 12.5,
    marginTop: 4,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  jewel: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: amber.jewel,
    shadowColor: amber.glow,
    shadowOpacity: 0.95,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  kicker: {
    fontFamily: fonts.plate,
    fontSize: 10,
    letterSpacing: 3.4,
    color: brass.mid,
  },
  name: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 30,
    letterSpacing: plateTracking(30) * 0.8,
    color: cream,
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 2 },
  },
  arriving: {
    fontFamily: fonts.speech,
    fontSize: 14,
    color: brass.muted,
    marginTop: 6,
  },
  screwWrap: {
    position: 'absolute',
    top: '50%',
    marginTop: -2.5,
  },
  screwLeft: { left: 8 },
  screwRight: { right: 8 },
  screw: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: brass.shadow,
    borderWidth: 0.5,
    borderColor: brass.light,
  },
});
