import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, cream, fonts } from '../../constants/ds6';
import { Plate } from './Plate';
import { FlipClock } from './FlipClock';
import { Needle } from './Needle';
import { timeToProse } from '../../utils/prose';
import type { Channel, Programme } from '../../types';

/**
 * The resting HUD apron — the walnut shelf under the sacred picture.
 *
 * Left: the channel's stamped plate. Center: what's playing, spoken in
 * Newsreader, with its provenance line. Right: key-hint plates and the
 * receiver's clock. Below: the amber needle with broadcast times.
 */

interface ApronProps {
  channel: Channel;
  nowPlaying?: Programme;
  clockNow: Date;
}

function metaLine(p?: Programme): string | null {
  if (!p) return null;
  const bits: string[] = [];
  if (p.year) bits.push(p.year);
  if (p.subtitle) bits.push(p.subtitle);
  // The apron tells time the way the announcer would.
  bits.push(`until ${timeToProse(p.stop)}`);
  return bits.join(' · ').toUpperCase();
}

export function Apron({ channel, nowPlaying, clockNow }: ApronProps) {
  return (
    <LinearGradient
      colors={[walnut.panel, walnut.deep, walnut.void]}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.apron}
    >
      <View style={styles.topRow}>
        <Plate
          kicker={`CHANNEL ${channel.number}`}
          label={channel.name.toUpperCase()}
          lit
          kickerSize={9}
          labelSize={14}
        />

        <View style={styles.speech}>
          <Text style={styles.title} numberOfLines={1}>
            {nowPlaying?.title ?? channel.name}
          </Text>
          {metaLine(nowPlaying) && (
            <Text style={styles.meta} numberOfLines={1}>
              {metaLine(nowPlaying)}
            </Text>
          )}
        </View>

        <View style={styles.controls}>
          <View style={styles.hint}>
            <Plate label="N" compact labelSize={11} />
            <Text style={styles.hintText}>NOTES</Text>
          </View>
          <View style={styles.hint}>
            <Plate label="G" compact labelSize={11} />
            <Text style={styles.hintText}>THIS EVENING</Text>
          </View>
          <FlipClock date={clockNow} />
        </View>
      </View>

      {nowPlaying && (
        <View style={styles.needleRow}>
          <Needle start={nowPlaying.start} stop={nowPlaying.stop} now={clockNow} />
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  apron: {
    paddingHorizontal: 34,
    paddingTop: 14,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.8)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  speech: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.plate,
    fontWeight: '600',
    fontSize: 24,
    color: cream,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 2 },
  },
  meta: {
    fontFamily: fonts.plate,
    fontSize: 10,
    letterSpacing: 2,
    color: brass.muted,
    marginTop: 3,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
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
  needleRow: {
    marginTop: 11,
  },
});
