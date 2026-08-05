import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { walnut, brass, amber, fonts } from '../../constants/ds6';
import { MColumnRegister } from './MHome';
import { FilamentLamp } from '../../ui/FilamentLamp';
import type { Channel, Programme } from '../../types';

/**
 * Watching, portrait — the live picture and inline column register.
 *
 * The picture keeps its proper 16:9 seat at the safe top edge. The
 * receiver's existing column shift occupies the rest of the cabinet,
 * compressed for direct, in-place tuning without hiding the programme.
 */

interface MReadingProps {
  channels: Channel[];
  tunedIndex: number;
  onTune: (index: number, origin: 'register' | 'external') => void;
  nowPlayingMap: Map<string, Programme>;
  upNextMap: Map<string, Programme>;
  clockNow: Date;
  width: number;
  onNotes: () => void;
  onBoard: () => void;
  /** The full register compresses as one linkage while the picture panel opens. */
  revealProgress?: Animated.Value;
  selectionRequest?: { index: number; token: number } | null;
}

function clock12(d: Date): string {
  const h = d.getHours() % 12 || 12;
  const mer = d.getHours() < 12 ? 'A.M.' : 'P.M.';
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${mer}`;
}

export function MReading({
  channels,
  tunedIndex,
  onTune,
  nowPlayingMap,
  upNextMap,
  clockNow,
  width,
  onNotes,
  onBoard,
  revealProgress,
  selectionRequest,
}: MReadingProps) {
  const insets = useSafeAreaInsets();
  const stripH = (width * 9) / 16;
  const safeTuned = Math.min(tunedIndex, channels.length - 1);
  const channel = channels[safeTuned];

  return (
    <View style={styles.room}>
      {/* This empty seat is overlaid by the one persistent native VideoView. */}
      <Pressable
        style={[styles.pictureSeat, { paddingTop: insets.top, height: insets.top + stripH }]}
        onLongPress={onNotes}
      >
        <View style={[styles.strip, { height: stripH }]} />
      </Pressable>

      <Animated.View
        style={[
          styles.registerCabinet,
          { paddingBottom: Math.max(insets.bottom, 10) },
          revealProgress && {
            transform: [
              { translateY: revealProgress.interpolate({ inputRange: [0, 1], outputRange: [-stripH, 0] }) },
              { scaleY: revealProgress.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.liveRail}>
          <LinearGradient
            colors={['#f2bd6b', '#d99b3f']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.chanPlate}
          >
            <FilamentLamp style={styles.jewel} amplitude={0.032} />
            <Text style={styles.chanText} numberOfLines={1}>
              CHANNEL {channel?.number} · {channel?.name.toUpperCase()}
            </Text>
          </LinearGradient>
          <Text style={styles.clock}>{clock12(clockNow)}</Text>
        </View>

        <MColumnRegister
          channels={channels}
          tunedIndex={safeTuned}
          onTune={onTune}
          nowPlayingMap={nowPlayingMap}
          upNextMap={upNextMap}
          compact
          engaged
          onBoard={onBoard}
          selectionRequest={selectionRequest}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  room: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  pictureSeat: {
    width: '100%',
    backgroundColor: '#000',
  },
  strip: {
    width: '100%',
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: walnut.void,
  },
  registerCabinet: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 14,
    backgroundColor: '#120a05',
    borderTopWidth: 1,
    borderTopColor: brass.shadow,
  },
  liveRail: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 7,
  },
  chanPlate: {
    minWidth: 0,
    maxWidth: '76%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
    paddingVertical: 5,
    paddingHorizontal: 10,
    shadowColor: amber.jewel,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  jewel: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: amber.jewel,
  },
  chanText: {
    flexShrink: 1,
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 8,
    letterSpacing: 1.4,
    color: '#2a1a08',
  },
  clock: {
    marginLeft: 'auto',
    fontFamily: fonts.plate,
    fontSize: 7,
    letterSpacing: 1.5,
    color: brass.mid,
  },
});
