import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, amber, cream, fonts } from '../../constants/ds6';
import { timeToProse } from '../../utils/prose';
import { Plate } from '../ds6/Plate';
import { clockShort, clock12 } from '../../utils/clock';
import { engrave, engravedWidth } from '../../ui/engraverFit';
import type { Channel, Programme } from '../../types';

/**
 * The traveling set's apron (9c) — the walnut shelf under the picture,
 * landscape. The channel plate wears amber; NOTES and THIS EVENING are
 * real buttons at glove size; the amber needle runs between the
 * broadcast's times; and the touch vocabulary is printed where a
 * rental set would print it.
 */

const BUTTON_PAD = 18;
const BUTTON_PAD_TIGHT = 10;
/** The compact "P" plate, as ds6/Plate draws it at this label size. */
const P_PLATE_W = 32;

/** Room for the channel name on its plate: "THE PRISONER" as drawn, with a point to spare. */
const CHAN_NAME_ROOM = 114;
const CHAN_PLATE_PAD = 14;
const CHAN_PLATE_PAD_TIGHT = 10;
const APRON_PAD = 22;
const APRON_PAD_TIGHT = 16;
/** The room a programme title wants beside the plate before the plate may widen. */
const SPEECH_MEASURE = 230;

interface MApronProps {
  channel: Channel;
  nowPlaying?: Programme;
  clockNow: Date;
  onNotes: () => void;
  onBoard: () => void;
  /** The amber channel plate, tapped — back to the receiver. */
  onHome: () => void;
  onPictureOut?: () => void;
}

export function MApron({ channel, nowPlaying, clockNow, onNotes, onBoard, onHome, onPictureOut }: MApronProps) {
  const progress = nowPlaying
    ? Math.min(1, Math.max(0, (clockNow.getTime() - nowPlaying.start.getTime()) / (nowPlaying.stop.getTime() - nowPlaying.start.getTime())))
    : 0;

  const metaWith = (until: string) => (nowPlaying
    ? [nowPlaying.year, `until ${until}`].filter(Boolean).join(' · ').toUpperCase()
    : null);

  // A small phone held sideways has no room for the apron as drawn: the
  // programme title was left a few points between the plate and the
  // buttons. The furniture yields (closer buttons, a stacked caption) so
  // the title has its line.
  const { width: winW } = useWindowDimensions();
  const tight = winW < 720;

  // The shelf as drawn, reckoned rather than measured: what the buttons,
  // the caption and the clock take, and so what is left for the channel
  // plate and the programme beside it.
  const buttonPad = tight ? BUTTON_PAD_TIGHT : BUTTON_PAD;
  const button = (label: string) => engravedWidth(label, 9, 1.6) + 2 * buttonPad + 2;
  const rowGap = tight ? 10 : 14;
  const controlsGap = tight ? 8 : 10;
  const controls = [
    button('NOTES'),
    button('THIS EVENING'),
    onPictureOut ? P_PLATE_W + 5 + engravedWidth(tight ? 'PICTURE' : 'PICTURE OUT', 7, 1.2, 400) : 0,
    engravedWidth(clock12(clockNow), 8, 1.4, 400),
  ].filter((w) => w > 0);
  const controlsW = controls.reduce((sum, w) => sum + w, 0) + (controls.length - 1) * controlsGap;
  const sidePad = tight ? APRON_PAD_TIGHT : APRON_PAD;
  const plateFurniture = 2 * (tight ? CHAN_PLATE_PAD_TIGHT : CHAN_PLATE_PAD) + 2;
  const shelf = winW - 2 * sidePad - 2 * rowGap - controlsW;

  // The channel plate always holds a name the length of the longest of the
  // original six on one line. A longer one has the line only where the
  // programme still keeps its measure beside it; otherwise it breaks at a
  // word and the plate grows taller, not wider.
  const name = engrave(channel.name, Math.max(CHAN_NAME_ROOM, shelf - plateFurniture - SPEECH_MEASURE), {
    fontSize: 10,
    minFontSize: 8,
    tracking: (size) => size * 0.16,
    minTrackingRatio: 0.5,
    twoLines: true,
    margin: 1,
  });

  // When the programme ends is said in the announcer's words if they go on
  // the line, and in figures if they do not ("UNTIL 10:45"): it is never
  // dotted off. The reckoning is kept a little short, since nothing here
  // is measured on the glass.
  const plateW = Math.max(
    ...name.lines.map((line) => engravedWidth(line, name.fontSize, name.letterSpacing)),
    engravedWidth(`CHANNEL ${channel.number}`, 6.5, 1.8, 400),
  ) + plateFurniture;
  const speechRoom = shelf - plateW - 6;
  const metaProse = nowPlaying ? metaWith(timeToProse(nowPlaying.stop)) : null;
  const meta = metaProse && engravedWidth(metaProse, 7.5, 1.7, 400) <= speechRoom
    ? metaProse
    : nowPlaying ? metaWith(clockShort(nowPlaying.stop)) : null;

  return (
    <LinearGradient
      colors={[walnut.panel, walnut.deep, walnut.void]}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.apron, tight && styles.apronTight]}
    >
      <View style={[styles.topRow, tight && styles.topRowTight]}>
        <Pressable onPress={onHome}>
          <LinearGradient colors={['#f2bd6b', '#d99b3f']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[styles.chanPlate, tight && styles.chanPlateTight]}>
            <Text style={styles.chanKicker}>CHANNEL {channel.number}</Text>
            {name.lines.map((line, l) => (
              <Text
                key={l}
                style={[
                  styles.chanName,
                  { fontSize: name.fontSize, letterSpacing: name.letterSpacing },
                  // Two lines are set close, so the taller plate still stands inside the buttons' height.
                  name.lines.length > 1 && { lineHeight: name.fontSize + 1.5 },
                  l > 0 && styles.chanNameSecond,
                ]}
                numberOfLines={1}
              >
                {line.toUpperCase()}
              </Text>
            ))}
          </LinearGradient>
        </Pressable>

        <View style={styles.speech}>
          <Text style={styles.title} numberOfLines={1}>{nowPlaying?.title ?? channel.name}</Text>
          {meta && <Text style={styles.meta} numberOfLines={1}>{meta}</Text>}
        </View>

        <View style={[styles.controls, tight && styles.controlsTight]}>
          <Pressable onPress={onNotes} style={[styles.button, tight && styles.buttonTight]}>
            <Text style={styles.buttonText}>NOTES</Text>
          </Pressable>
          <Pressable onPress={onBoard} style={[styles.button, tight && styles.buttonTight]}>
            <Text style={styles.buttonText}>THIS EVENING</Text>
          </Pressable>
          {onPictureOut && (
            <Pressable onPress={onPictureOut} style={styles.pictureOut}>
              <Plate label="P" compact labelSize={9} />
              <Text style={styles.pictureOutText}>{tight ? 'PICTURE\nOUT' : 'PICTURE OUT'}</Text>
            </Pressable>
          )}
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
    paddingHorizontal: APRON_PAD,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.8)',
  },
  apronTight: {
    paddingHorizontal: APRON_PAD_TIGHT,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  topRowTight: {
    gap: 10,
  },
  chanPlate: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
    paddingVertical: 4,
    paddingHorizontal: CHAN_PLATE_PAD,
    alignItems: 'center',
    shadowColor: amber.jewel,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  chanPlateTight: {
    paddingHorizontal: CHAN_PLATE_PAD_TIGHT,
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
    textAlign: 'center',
    marginTop: 1,
  },
  chanNameSecond: {
    marginTop: 0,
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
  controlsTight: {
    gap: 8,
  },
  button: {
    height: 44,
    paddingHorizontal: BUTTON_PAD,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a1c0e',
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 5,
  },
  buttonTight: {
    paddingHorizontal: BUTTON_PAD_TIGHT,
  },
  buttonText: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 1.6,
    color: brass.bright,
  },
  pictureOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pictureOutText: {
    fontFamily: fonts.plate,
    fontSize: 7,
    letterSpacing: 1.2,
    color: brass.mid,
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
