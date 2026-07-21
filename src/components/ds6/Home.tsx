import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, amber, cream, fonts, plateTracking } from '../../constants/ds6';
import { Plate } from './Plate';
import { FlipClock } from './FlipClock';
import { Dial } from './Dial';
import { greeting, countWord } from '../../utils/prose';
import type { Channel } from '../../types';

/**
 * Home — the six(ish)-channel receiver, cabinet face on.
 *
 * The wordmark stamped top-left with the one chrome signature beside it;
 * the announcer's greeting top-right; the dial amidships; the service
 * rail along the bottom with the model stamp, key hints, the power
 * jewel, and the clock.
 */

interface HomeProps {
  channels: Channel[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onTune: (index: number) => void;
  clockNow: Date;
}

export function Home({ channels, selectedIndex, onSelect, onTune, clockNow }: HomeProps) {
  return (
    <LinearGradient
      colors={[walnut.panel, walnut.deep, walnut.void]}
      start={{ x: 0.3, y: 0.2 }}
      end={{ x: 0.6, y: 1 }}
      style={styles.cabinet}
    >
      {/* Masthead */}
      <View style={styles.masthead}>
        <View style={styles.mark}>
          <Plate label="D S , P" labelSize={16} />
          <Text style={styles.signature}>dead simple, player</Text>
        </View>
        <Text style={styles.greeting}>{greeting(clockNow)}</Text>
      </View>

      {/* The dial */}
      <Dial channels={channels} selectedIndex={selectedIndex} onSelect={onSelect} onTune={onTune} />

      {/* Service rail */}
      <View style={styles.rail}>
        <Plate
          label={`MODEL DS-${channels.length} · ${countWord(channels.length)}-CHANNEL RECEIVER`}
          compact
          labelSize={9}
        />
        <View style={styles.hints}>
          <View style={styles.hint}>
            <Plate label="◀ ▶" compact labelSize={10} />
            <Text style={styles.hintText}>TUNE</Text>
          </View>
          <View style={styles.hint}>
            <Plate label="⏎" compact labelSize={10} />
            <Text style={styles.hintText}>WATCH</Text>
          </View>
          <View style={styles.hint}>
            <Plate label="G" compact labelSize={10} />
            <Text style={styles.hintText}>THIS EVENING</Text>
          </View>
        </View>
        <View style={styles.clockSide}>
          <View style={styles.power}>
            <View style={styles.jewel} />
            <Text style={styles.hintText}>POWER</Text>
          </View>
          <FlipClock date={clockNow} />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  cabinet: {
    ...StyleSheet.absoluteFillObject,
  },
  masthead: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingTop: 34,
    zIndex: 2,
  },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  signature: {
    fontFamily: fonts.signature,
    fontSize: 24,
    color: amber.needle,
    transform: [{ rotate: '-2deg' }],
  },
  greeting: {
    fontFamily: fonts.speech,
    fontSize: 17,
    color: cream,
    opacity: 0.92,
  },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,229,207,0.07)',
    backgroundColor: 'rgba(13,7,2,0.55)',
    zIndex: 2,
  },
  hints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  hintText: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 1.8,
    color: brass.mid,
  },
  clockSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  power: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  jewel: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: amber.jewel,
    shadowColor: amber.glow,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
