import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, cream, fonts, plateTracking } from '../../constants/ds6';
import { Plate } from './Plate';
import { FlipClock } from './FlipClock';
import { Needle } from './Needle';
import { timeToProse } from '../../utils/prose';
import { useConsoleMetrics } from '../../ui/ConsoleStage';
import { engrave, engravedWidth, type EngraveOptions } from '../../ui/engraverFit';
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
  onPictureOut?: () => void;
}

const APRON_PADDING = 34;
const TOP_ROW_GAP = 22;
const CONTROLS_GAP = 16;
/** The receiver's clock at its widest (four digits), as drawn. */
const CLOCK_WIDTH = 180;
/** The least the programme's title is owed before the furniture gives way. */
const MIN_SPEECH = 300;
/** A station name that has to draw in is cut to this, breaking at a word if it must. */
const NARROW_NAME = 150;

const NAME_SIZE = 14;
const nameTracking = (size: number) => plateTracking(size) * 0.55;
const NAME_CUT: EngraveOptions = {
  fontSize: NAME_SIZE,
  minFontSize: 12,
  tracking: nameTracking,
  minTrackingRatio: 0.5,
  weight: 700,
  twoLines: true,
};

/** A key legend: its compact plate (11px, 11 of padding, hairline border), a gap, its caption. */
function legendWidth(key: string, caption: string | null): number {
  const plate = engravedWidth(key, 11, nameTracking(11), 700) + 11 * 2 + 2;
  return caption ? plate + 7 + engravedWidth(caption, 9, 1.8, 400) : plate;
}

/** The station plate: face padding 18 each side and a hairline border around the wider of its two lines. */
function stationPlateWidth(kicker: string, nameWidth: number): number {
  return Math.max(nameWidth, engravedWidth(kicker, 9, plateTracking(9), 400)) + 18 * 2 + 2;
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

export function Apron({ channel, nowPlaying, clockNow, onPictureOut }: ApronProps) {
  // The stage's logical width; an ultrawide display keeps the shelf's
  // contents under the picture and lets the walnut run on to the walls.
  const { width: screenWidth, gutter } = useConsoleMetrics();
  const width = screenWidth - gutter * 2;

  // The shelf was drawn for a laptop. Where the programme's title would be
  // squeezed (an iPad, a long station name) the furniture gives way in
  // order: the station name draws in on its plate, breaking at a word if it
  // must; then the key legends drop their captions. Nothing is dotted off.
  const kicker = `CHANNEL ${channel.number}`;
  const legends: Array<[string, string]> = [['N', 'NOTES'], ['G', 'THIS EVENING']];
  if (onPictureOut) legends.push(['P', 'PICTURE OUT']);
  const controlsWidth = (captions: boolean) =>
    legends.reduce((sum, [key, caption]) => sum + legendWidth(key, captions ? caption : null) + CONTROLS_GAP, 0)
    + CLOCK_WIDTH;
  const speechRoom = (nameWidth: number, captions: boolean) =>
    width - APRON_PADDING * 2 - TOP_ROW_GAP * 2 - stationPlateWidth(kicker, nameWidth) - controlsWidth(captions);

  const drawn = engravedWidth(channel.name, NAME_SIZE, nameTracking(NAME_SIZE), 700);
  const tight = speechRoom(drawn, true) < MIN_SPEECH;
  const name = engrave(channel.name, tight ? NARROW_NAME : Infinity, NAME_CUT);
  const nameWidth = Math.max(...name.lines.map((line) => engravedWidth(line, name.fontSize, name.letterSpacing, 700)));
  const captions = speechRoom(nameWidth, true) >= MIN_SPEECH;

  return (
    <LinearGradient
      colors={[walnut.panel, walnut.deep, walnut.void]}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.apron, gutter > 0 && { paddingHorizontal: APRON_PADDING + gutter }]}
    >
      <View style={styles.topRow}>
        <Plate
          kicker={`CHANNEL ${channel.number}`}
          label={channel.name.toUpperCase()}
          labelLines={name.lines.map((line) => line.toUpperCase())}
          labelTracking={name.letterSpacing}
          lit
          kickerSize={9}
          labelSize={name.fontSize}
        />

        <View style={styles.speech}>
          <Text style={styles.title} numberOfLines={1}>
            {nowPlaying?.title ?? channel.name}
          </Text>
          {metaLine(nowPlaying) && (
            <Text style={styles.meta} numberOfLines={2}>
              {metaLine(nowPlaying)}
            </Text>
          )}
        </View>

        <View style={styles.controls}>
          <View style={styles.hint}>
            <Plate label="N" compact labelSize={11} />
            {captions && <Text style={styles.hintText}>NOTES</Text>}
          </View>
          <View style={styles.hint}>
            <Plate label="G" compact labelSize={11} />
            {captions && <Text style={styles.hintText}>THIS EVENING</Text>}
          </View>
          {onPictureOut && (
            <Pressable onPress={onPictureOut} style={styles.hint}>
              <Plate label="P" compact labelSize={11} />
              {captions && <Text style={styles.hintText}>PICTURE OUT</Text>}
            </Pressable>
          )}
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
    paddingHorizontal: APRON_PADDING,
    paddingTop: 14,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.8)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TOP_ROW_GAP,
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
    gap: CONTROLS_GAP,
    flexShrink: 0,
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
