import { View, Text, StyleSheet, ScrollView, type LayoutRectangle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, amber, cream, fonts } from '../../constants/ds6';
import { durationProse } from '../../utils/prose';
import type { Channel, Programme } from '../../types';

/**
 * Watching, portrait — the reading orientation (9d).
 *
 * Upright is for reading. The picture keeps playing in a letterboxed
 * strip below the amber channel plate, and the programme notes unroll
 * beneath it: the intermission essay, set for one thumb and two eyes.
 */

interface MReadingProps {
  channel: Channel;
  nowPlaying?: Programme;
  clockNow: Date;
  width: number;
  /** Reports the strip so the one persistent player can be seated over it. */
  onPictureLayout?: (layout: LayoutRectangle) => void;
}

function clockShort(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function clock12(d: Date): string {
  const mer = d.getHours() < 12 ? 'A.M.' : 'P.M.';
  return `${clockShort(d)} ${mer}`;
}

function metaLine(p: Programme): string {
  const bits: string[] = [];
  if (p.year) bits.push(p.year);
  bits.push(durationProse(p.start, p.stop));
  if (p.subtitle) bits.push(p.subtitle);
  else if (p.episodeNum) bits.push(p.episodeNum);
  return bits.join(' · ').toUpperCase();
}

export function MReading({ channel, nowPlaying, clockNow, width, onPictureLayout }: MReadingProps) {
  const stripH = Math.round((width * 9) / 16);
  const paragraphs = (nowPlaying?.description ?? '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const progress = nowPlaying
    ? Math.min(1, Math.max(0, (clockNow.getTime() - nowPlaying.start.getTime()) / (nowPlaying.stop.getTime() - nowPlaying.start.getTime())))
    : 0;

  return (
    <View style={styles.room}>
      {/* header: the amber plate and the hour */}
      <View style={styles.header}>
        <LinearGradient colors={['#f2bd6b', '#d99b3f']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.chanPlate}>
          <Text style={styles.chanText}>CHANNEL {channel.number} · {channel.name.toUpperCase()}</Text>
        </LinearGradient>
        <Text style={styles.clock}>{clock12(clockNow)}</Text>
      </View>

      {/* the picture, edge to edge in its strip */}
      <View
        style={[styles.strip, { height: stripH }]}
        onLayout={(event) => onPictureLayout?.(event.nativeEvent.layout)}
      />

      {/* the notes */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.notes} showsVerticalScrollIndicator={false}>
        <View style={styles.notesPlate}>
          <View style={styles.jewel} />
          <Text style={styles.notesPlateText}>PROGRAMME NOTES — CHANNEL {channel.number}</Text>
        </View>
        <Text style={styles.title}>{nowPlaying?.title ?? channel.name}</Text>
        {nowPlaying && <Text style={styles.meta}>{metaLine(nowPlaying)}</Text>}
        <View style={styles.ruleRow}>
          <View style={styles.ruleLine} />
          <View style={styles.ruleDiamond} />
          <View style={styles.ruleLine} />
        </View>
        {paragraphs.length > 0 ? (
          paragraphs.map((para, i) => (
            <Text key={i} style={i === 0 ? styles.lede : styles.body}>{para}</Text>
          ))
        ) : (
          <Text style={styles.body}>The library offers no notes for this programme.</Text>
        )}
        <Text style={styles.readOn}>↓ READ ON</Text>
      </ScrollView>

      {/* footer: the rotate courtesy and faith with the broadcast */}
      <View style={styles.footer}>
        <View style={styles.rotateGlyph} />
        <Text style={styles.footProse} numberOfLines={1}>lay the set on its side for the full picture</Text>
        <View style={styles.track}>
          {nowPlaying && <View style={[styles.fill, { width: `${progress * 100}%` }]} />}
        </View>
        {nowPlaying && <Text style={styles.ends}>ENDS {clockShort(nowPlaying.stop)}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  room: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#120a05',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  chanPlate: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
    paddingVertical: 4,
    paddingHorizontal: 12,
    shadowColor: amber.jewel,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  chanText: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 1.6,
    color: '#2a1a08',
  },
  clock: {
    marginLeft: 'auto',
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 1.8,
    color: brass.mid,
  },
  strip: {
    width: '100%',
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: walnut.void,
    overflow: 'hidden',
  },
  notes: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 30,
    alignItems: 'center',
  },
  notesPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: walnut.grain,
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  jewel: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: amber.jewel,
    shadowColor: amber.glow,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  notesPlateText: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 2.2,
    color: brass.bright,
  },
  title: {
    fontFamily: fonts.plate,
    fontWeight: '600',
    fontSize: 34,
    lineHeight: 40,
    paddingBottom: 4,
    color: cream,
    marginTop: 14,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 2 },
  },
  meta: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 1.8,
    color: brass.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  ruleLine: {
    width: 80,
    height: 1,
    backgroundColor: 'rgba(241,229,207,0.28)',
  },
  ruleDiamond: {
    width: 4,
    height: 4,
    backgroundColor: amber.needle,
    transform: [{ rotate: '45deg' }],
  },
  lede: {
    fontFamily: fonts.speech,
    fontSize: 14,
    lineHeight: 24,
    color: cream,
    marginTop: 14,
    alignSelf: 'stretch',
  },
  body: {
    fontFamily: fonts.speech,
    fontSize: 13,
    lineHeight: 21.5,
    color: '#cbba99',
    marginTop: 10,
    alignSelf: 'stretch',
  },
  readOn: {
    fontFamily: fonts.plate,
    fontSize: 7.5,
    letterSpacing: 2,
    color: '#6e5f4b',
    marginTop: 14,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.8)',
  },
  rotateGlyph: {
    width: 18,
    height: 11,
    borderWidth: 1.5,
    borderColor: brass.mid,
    borderRadius: 2,
  },
  footProse: {
    fontFamily: fonts.speech,
    fontSize: 11.5,
    color: '#6e5f4b',
    flexShrink: 1,
  },
  track: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(241,229,207,0.15)',
  },
  fill: {
    height: 1,
    backgroundColor: amber.needle,
    shadowColor: amber.needle,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  ends: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 1.3,
    color: '#6e5f4b',
  },
});
