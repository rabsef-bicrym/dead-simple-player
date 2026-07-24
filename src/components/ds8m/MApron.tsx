import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, amber, cream, fonts } from '../../constants/ds6';
import { timeToProse } from '../../utils/prose';
import type { Channel, Programme } from '../../types';

/**
 * The traveling set's apron (9c) — the walnut shelf under the picture,
 * landscape. The channel plate wears amber; NOTES and THIS EVENING are
 * real buttons at glove size; the amber needle runs between the
 * broadcast's times; and the touch vocabulary is printed where a
 * rental set would print it.
 */

interface MApronProps {
  channel: Channel;
  nowPlaying?: Programme;
  clockNow: Date;
  onNotes: () => void;
  onBoard: () => void;
  /** The amber channel plate, tapped — back to the receiver. */
  onHome: () => void;
}

function clockShort(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function clock12(d: Date): string {
  const mer = d.getHours() < 12 ? 'A.M.' : 'P.M.';
  return `${clockShort(d)} ${mer}`;
}

export function MApron({ channel, nowPlaying, clockNow, onNotes, onBoard, onHome }: MApronProps) {
  const progress = nowPlaying
    ? Math.min(1, Math.max(0, (clockNow.getTime() - nowPlaying.start.getTime()) / (nowPlaying.stop.getTime() - nowPlaying.start.getTime())))
    : 0;

  const meta = nowPlaying
    ? [nowPlaying.year, `until ${timeToProse(nowPlaying.stop)}`].filter(Boolean).join(' · ').toUpperCase()
    : null;

  return (
    <LinearGradient
      colors={[walnut.panel, walnut.deep, walnut.void]}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.apron}
    >
      <View style={styles.topRow}>
        <Pressable onPress={onHome}>
          <LinearGradient colors={['#f2bd6b', '#d99b3f']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.chanPlate}>
            <Text style={styles.chanKicker}>CHANNEL {channel.number}</Text>
            <Text style={styles.chanName}>{channel.name.toUpperCase()}</Text>
          </LinearGradient>
        </Pressable>

        <View style={styles.speech}>
          <Text style={styles.title} numberOfLines={1}>{nowPlaying?.title ?? channel.name}</Text>
          {meta && <Text style={styles.meta} numberOfLines={1}>{meta}</Text>}
        </View>

        <View style={styles.controls}>
          <Pressable onPress={onNotes} style={styles.button}>
            <Text style={styles.buttonText}>NOTES</Text>
          </Pressable>
          <Pressable onPress={onBoard} style={styles.button}>
            <Text style={styles.buttonText}>THIS EVENING</Text>
          </Pressable>
          <Text style={styles.clock}>{clock12(clockNow)}</Text>
        </View>
      </View>

      {nowPlaying && (
        <View style={styles.needleRow}>
          <Text style={styles.needleTime}>{clockShort(nowPlaying.start)}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.needleTime}>{clockShort(nowPlaying.stop)}</Text>
        </View>
      )}

      <Text style={styles.vocab}>SWIPE ACROSS TO TUNE — TAP TO WAKE THIS APRON — PRESS AND HOLD FOR NOTES</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  apron: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.8)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  chanPlate: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
    paddingVertical: 4,
    paddingHorizontal: 14,
    alignItems: 'center',
    shadowColor: amber.jewel,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  chanKicker: {
    fontFamily: fonts.plate,
    fontSize: 6.5,
    letterSpacing: 1.8,
    color: 'rgba(42,26,8,0.7)',
  },
  chanName: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 1.6,
    color: '#2a1a08',
    marginTop: 1,
  },
  speech: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.plate,
    fontWeight: '600',
    fontSize: 17,
    color: cream,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 2 },
  },
  meta: {
    fontFamily: fonts.plate,
    fontSize: 7.5,
    letterSpacing: 1.7,
    color: brass.muted,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  button: {
    height: 44,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a1c0e',
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 5,
  },
  buttonText: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 1.6,
    color: brass.bright,
  },
  clock: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 1.4,
    color: brass.mid,
  },
  needleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 9,
  },
  needleTime: {
    fontFamily: fonts.plate,
    fontSize: 7,
    letterSpacing: 1.4,
    color: '#6e5f4b',
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(241,229,207,0.14)',
  },
  fill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: amber.needle,
    shadowColor: amber.jewel,
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  vocab: {
    textAlign: 'center',
    fontFamily: fonts.plate,
    fontSize: 6.5,
    letterSpacing: 1.8,
    color: '#6e5f4b',
    marginTop: 8,
  },
});
