import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';
import { walnut, brass, amber, cream, fonts } from '../../constants/ds6';
import { playSignoffTone } from '../../utils/sound';
import { timeToProse } from '../../utils/prose';
import type { Channel, Programme } from '../../types';

/**
 * Sign-off (10g) — the broadcast day concludes.
 *
 * The POWER jewel, pressed: the stream stops, the room goes near-dark,
 * and the set says good night the way a station used to. A tap wakes
 * the dial, not the picture.
 */

interface SignOffProps {
  channel?: Channel;
  next?: Programme;
  onWake: () => void;
}

export function SignOff({ channel, next, onWake }: SignOffProps) {
  useEffect(() => {
    playSignoffTone();
  }, []);

  const resumes = next && channel
    ? `PROGRAMMING RESUMES AT ${timeToProse(next.start).toUpperCase()} — CHANNEL ${channel.number}, ${next.title.toUpperCase()}`
    : channel
      ? `PROGRAMMING CONTINUES ON CHANNEL ${channel.number}`
      : 'PROGRAMMING CONTINUES';

  return (
    <Pressable style={styles.room} onPress={onWake}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="signoffLight" cx="50%" cy="35%" rx="100%" ry="120%">
            <Stop offset="0%" stopColor="#1c1109" />
            <Stop offset="70%" stopColor="#100904" />
            <Stop offset="100%" stopColor="#0b0603" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#signoffLight)" />
      </Svg>

      <View style={styles.column} pointerEvents="none">
        <Text style={styles.goodnight}>good night</Text>
        <View style={styles.plate}>
          <Text style={styles.plateText}>DS,P HAS CONCLUDED ITS BROADCAST DAY</Text>
          <View style={[styles.screw, { left: 8 }]} />
          <View style={[styles.screw, { right: 8 }]} />
        </View>
        <Text style={styles.resumes}>{resumes}</Text>
        <Text style={styles.prose}>a tap wakes the dial, not the picture</Text>
      </View>

      <View style={styles.powerRow} pointerEvents="none">
        <View style={styles.powerJewel} />
        <Text style={styles.powerText}>POWER</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  room: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#100904',
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  goodnight: {
    fontFamily: fonts.signature,
    fontSize: 34,
    color: amber.needle,
    transform: [{ rotate: '-2deg' }],
    textShadowColor: 'rgba(223,161,79,0.4)',
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  plate: {
    backgroundColor: walnut.grain,
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 38,
    marginTop: 18,
  },
  plateText: {
    fontFamily: fonts.plate,
    fontSize: 11,
    letterSpacing: 3,
    color: brass.bright,
    textAlign: 'center',
  },
  screw: {
    position: 'absolute',
    top: '50%',
    marginTop: -2.5,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: brass.shadow,
    borderWidth: 0.5,
    borderColor: brass.light,
  },
  resumes: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 2.2,
    color: brass.mid,
    marginTop: 16,
    textAlign: 'center',
    maxWidth: 560,
    lineHeight: 16,
  },
  prose: {
    fontFamily: fonts.speech,
    fontSize: 12.5,
    color: '#6e5f4b',
    marginTop: 10,
  },
  powerRow: {
    position: 'absolute',
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  powerJewel: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: amber.jewel,
    opacity: 0.55,
    shadowColor: amber.glow,
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  powerText: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 2.4,
    color: '#6e5f4b',
  },
});
