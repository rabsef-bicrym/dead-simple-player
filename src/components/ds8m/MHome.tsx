import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, useWindowDimensions } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import Svg, { Defs, Rect, RadialGradient, Stop, Circle, Line } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { walnut, brass, amber, cream, fonts } from '../../constants/ds6';
import { playSound } from '../../utils/sound';
import { timeToProse, countWord } from '../../utils/prose';
import { FilamentLamp } from '../../ui/FilamentLamp';
import {
  BLOOM_RAMP_MS,
  FILAMENT_WARM_EASE,
  GEAR_CROSSBAR_MS,
  GEAR_NEUTRAL_MS,
  MECHANICAL_EASE_OUT,
  REGISTER_LINKAGE_MS,
  STAMP_MS,
  STAMP_STAGGER_MS,
  motionDuration,
  useReducedMotion,
} from '../../ui/motion';
import { clock12, clockShort } from '../../utils/clock';
import { engrave, engravedWidth } from '../../ui/engraverFit';
import { elapsedFraction } from '../../ui/elapsed';
import { WalnutGrain } from '../../ui/Walnut';
import { blurbBudget, gateLegend, gateLegendColumn, numeralCut, shortenBlurb, thenComes, type GateLegendOptions } from './plateFit';
import type { Channel, Programme } from '../../types';

/**
 * The DS-8/M home — the traveling set's receiver, both uprightnesses.
 *
 * Landscape (9a): the dial becomes a floor shifter. One slot for every
 * two stations, a gate at each end — ten forward speeds today, each with
 * its numeral at the gate and its name cut whole beside it.
 * Drag isn't required: run the gate with a sideways swipe, or tap a
 * gate and the lever throws itself there, through neutral, and settles
 * with the same detent the big dial uses.
 *
 * Portrait (9b): the column shift. One position per station, with the
 * lever on its rail beside the tuned row.
 */

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** A small stamped screwhead, drawn cheap. */
function Screw({ style }: { style?: object }) {
  return <View style={[styles.screw, style]} />;
}

/** The amber jewel — this lamp means it's real. */
function Jewel({ size = 7, amplitude = 0.035 }: { size?: number; amplitude?: number }) {
  return (
    <FilamentLamp
      amplitude={amplitude}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: amber.jewel,
        shadowColor: amber.glow,
        shadowOpacity: 0.9,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
      }}
    />
  );
}

/** Side padding, always given edge by edge so a safe-area inset can widen one side. */
interface SidePad { paddingLeft: number; paddingRight: number }
const MASTHEAD_PAD: SidePad = { paddingLeft: 24, paddingRight: 24 };

/** The masthead: the D S , P plate, the one chrome signature, the hour. */
function Masthead({ clockNow, compact, pad = MASTHEAD_PAD }: { clockNow: Date; compact?: boolean; pad?: SidePad }) {
  return (
    <View style={[styles.masthead, pad]}>
      <View style={styles.markShell}>
        <LinearGradient colors={[walnut.grain, '#231507']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.markFace}>
          <Text style={[styles.markText, compact && { fontSize: 11 }]}>D S , P</Text>
        </LinearGradient>
        <Screw style={{ left: 4, top: '50%', marginTop: -2 }} />
        <Screw style={{ right: 4, top: '50%', marginTop: -2 }} />
      </View>
      <Text style={styles.signature}>dead simple, player</Text>
      <Text style={styles.mastClock}>
        {compact ? clock12(clockNow) : `${DAYS[clockNow.getDay()]} · ${clock12(clockNow)}`}
      </Text>
    </View>
  );
}

// ── The gated shifter (9a) ──

// The plate is drawn at these sizes and scaled as one piece to the room's
// height. Its width is not fixed: ten speeds need wider columns than six
// did, so the home hands the plate what the answering panel can spare.
const PLATE_H = 272;
/** The plate as first drawn, for six speeds. It is never narrower than this. */
const PLATE_DRAWN_W = 372;
/** Past this the ten legends are already at their designed size, and the panel wants the room. */
const PLATE_MAX_W = 480;
const PLATE_PAD = 6;
const SLOT_TOP = 71;
const SLOT_H = 132;
const RAIL_Y = 131; // the neutral crossbar
const KNOB = 46;
/** A gate's tap target starts this far down, clear of the plate's heading. */
const GATE_TAP_INSET = 24;
/** The lever seats this far in from a slot's end. */
const GATE_SEAT = 22;

// A gate's legend: the numeral nearest the slot, the name outboard of it.
const LEGEND_NUMERAL = 13;
const LEGEND_NUMERAL_LINE = 15;
const LEGEND_NAME = 9.5;
/** The legend is never cut below this on the plate, nor below 7.5 on the glass. */
const LEGEND_NAME_MIN = 8;
const LEGEND_ON_GLASS_MIN = 7.5;
const LEGEND_H = LEGEND_NUMERAL_LINE + 2 * (LEGEND_NAME + 1.5);
const legendTracking = (fontSize: number) => fontSize * 0.13;
/** Clear air between one gate's legend and the next. */
const LEGEND_GUTTER = 4;

/**
 * How the gate's legend is cut on a plate shown at `scale`. The floor is
 * held on the glass, after the plate's scale, not merely on the drawing: a
 * short window draws the legend larger so that it lands no smaller.
 */
function legendCut(scale: number): GateLegendOptions {
  const floor = Math.max(LEGEND_NAME_MIN, Math.ceil((LEGEND_ON_GLASS_MIN / scale) * 2) / 2);
  return {
    fontSize: Math.max(LEGEND_NAME, floor),
    minFontSize: floor,
    tracking: legendTracking,
    // A name closes its tracking to half before it breaks at a word; one
    // long word, which cannot break, may close to a quarter.
    minTrackingRatio: 0.5,
    lastResortTrackingRatio: 0.25,
  };
}

/** The narrowest plate on which every one of these names is whole at the floor size. */
function plateNeed(names: string[], scale: number): number {
  const slots = Math.max(1, Math.ceil(names.length / 2));
  const column = gateLegendColumn(names, legendCut(scale)) + LEGEND_GUTTER + 0.5;
  return Math.max(PLATE_DRAWN_W, slots * column + 2 * PLATE_PAD);
}

interface ShifterProps {
  channels: Channel[];
  selectedIndex: number;
  onGate: (index: number) => void;
  scale: number;
  /** The plate's drawn width, before `scale`. */
  width: number;
}

function Shifter({ channels, selectedIndex, onGate, scale, width }: ShifterProps) {
  const reducedMotion = useReducedMotion();
  const slots = Math.max(1, Math.ceil(channels.length / 2));
  // One column a slot, edge to edge: a legend is centred on its slot and
  // owns the column, so no two can meet.
  const column = (width - 2 * PLATE_PAD) / slots;
  const slotX = (s: number) => PLATE_PAD + column * (s + 0.5);
  const gatePos = (i: number) => {
    const s = Math.floor(i / 2);
    const top = i % 2 === 0;
    return { x: slotX(s), y: top ? SLOT_TOP + GATE_SEAT : SLOT_TOP + SLOT_H - GATE_SEAT };
  };

  // Every name is cut at one size, the largest at which all of them go into
  // a column, long ones broken at a word.
  const names = channels.map((ch) => ch.name);
  const namesKey = names.join('\n');
  const legend = useMemo(
    () => gateLegend(names, column - LEGEND_GUTTER, legendCut(scale)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [namesKey, column, scale],
  );

  const target = gatePos(Math.min(selectedIndex, channels.length - 1));
  const pos = useRef(new Animated.ValueXY(target)).current;
  const prevIndex = useRef(selectedIndex);

  // The plate's width follows the window. If it changes under a resting
  // lever (a resized review window, a split screen), reseat the lever.
  useEffect(() => {
    pos.stopAnimation();
    pos.setValue(gatePos(Math.min(prevIndex.current, channels.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [column]);

  // The throw: pull to neutral, run the gate, push home. Detent on
  // settle — the same click the big dial makes.
  useEffect(() => {
    if (prevIndex.current === selectedIndex) return;
    const from = gatePos(prevIndex.current);
    const to = gatePos(selectedIndex);
    prevIndex.current = selectedIndex;
    pos.stopAnimation();
    const leg = (x: number, y: number, ms: number) => Animated.timing(pos, {
      toValue: { x, y },
      duration: motionDuration(ms, reducedMotion),
      easing: MECHANICAL_EASE_OUT,
      useNativeDriver: true,
    });
    Animated.sequence([
      leg(from.x, RAIL_Y + 6, GEAR_NEUTRAL_MS),
      leg(to.x, RAIL_Y + 6, GEAR_CROSSBAR_MS),
      leg(to.x, to.y, GEAR_NEUTRAL_MS),
    ]).start();
    const detent = setTimeout(
      () => playSound('detent'),
      motionDuration(GEAR_NEUTRAL_MS + GEAR_CROSSBAR_MS + GEAR_NEUTRAL_MS, reducedMotion),
    );
    return () => {
      clearTimeout(detent);
      pos.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, reducedMotion]);

  return (
    <View style={{ width: width * scale, height: PLATE_H * scale }}>
      {/* Scaled about its centre, then walked back, so the plate's top-left
          corner stays on the wrapper's: the scaled plate fills the box the
          row was told it has, instead of sitting half its shrinkage off. */}
      <View
        style={[
          styles.shifterPlate,
          {
            width,
            height: PLATE_H,
            transform: [
              { translateX: (-width * (1 - scale)) / 2 },
              { translateY: (-PLATE_H * (1 - scale)) / 2 },
              { scale },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={PLATE_REST}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.shifterFace}
        />
        <Screw style={{ left: 8, top: 8 }} />
        <Screw style={{ right: 8, top: 8 }} />
        <Screw style={{ left: 8, bottom: 8 }} />
        <Screw style={{ right: 8, bottom: 8 }} />
        <Text style={styles.shifterHead}>
          CHANNEL SELECTOR — {countWord(channels.length)} FORWARD SPEEDS
        </Text>

        {/* the gates and their rail */}
        {Array.from({ length: slots }, (_, s) => (
          <View key={s} style={[styles.slot, { left: slotX(s) - 6 }]} />
        ))}
        <View style={[styles.rail, { left: slotX(0) - 6, width: slotX(slots - 1) - slotX(0) + 12 }]} />

        {/* gear legends, tappable — the gate answers the finger. Each speed
            owns its column from the plate's edge to the crossbar, so the
            targets are as large as the plate allows and cannot overlap. */}
        {channels.map((ch, i) => {
          const s = Math.floor(i / 2);
          const top = i % 2 === 0;
          const active = i === selectedIndex;
          const cut = legend.names[i];
          const tapTop = top ? GATE_TAP_INSET : RAIL_Y + 6 + 1;
          const tapH = RAIL_Y + 6 - 1 - GATE_TAP_INSET;
          const legendTop = top ? SLOT_TOP - 5 - LEGEND_H : SLOT_TOP + SLOT_H + 4;
          const nameStyle = [
            styles.gateName,
            {
              fontSize: legend.fontSize,
              lineHeight: legend.fontSize + 1.5,
              letterSpacing: cut.letterSpacing,
            },
            active && styles.gateLabelLit,
          ];
          const numeral = (
            <Text style={[styles.gateNumeral, active && styles.gateLabelLit]} numberOfLines={1}>
              {ch.number}
            </Text>
          );
          return (
            <Pressable
              key={ch.id}
              accessibilityRole="button"
              accessibilityLabel={`Channel ${ch.number}, ${ch.name}`}
              onPress={() => onGate(i)}
              style={[styles.gateTap, { left: slotX(s) - column / 2 + 1, width: column - 2, top: tapTop, height: tapH }]}
            >
              <View
                style={[
                  styles.gateLegend,
                  { top: legendTop - tapTop, height: LEGEND_H, justifyContent: top ? 'flex-end' : 'flex-start' },
                ]}
              >
                {!top && numeral}
                {cut.lines.map((line, l) => (
                  // The cut already fits; one line each is only the net under it.
                  <Text key={l} style={nameStyle} numberOfLines={1}>{line.toUpperCase()}</Text>
                ))}
                {top && numeral}
              </View>
            </Pressable>
          );
        })}

        {/* the lever knob and its jewel */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.knob,
            {
              transform: [
                { translateX: Animated.subtract(pos.x, KNOB / 2) },
                { translateY: Animated.subtract(pos.y, KNOB / 2) },
              ],
            },
          ]}
        >
          <ShiftKnob size={KNOB - 2} />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.knobJewel,
            {
              transform: [
                { translateX: Animated.subtract(pos.x, 5) },
                { translateY: Animated.subtract(pos.y, 5) },
              ],
            },
          ]}
        />

        <Text style={styles.shifterFoot}>SWIPE TO RUN THE GATE — OR TAP A SPEED</Text>
      </View>
    </View>
  );
}

// ── Landscape home (9a) ──

/** The answering panel's reading measure: the blurb is never set wider. */
const PANEL_MEASURE = 340;
/** The least the panel is ever left, whatever the gate would like. */
const PANEL_FLOOR = 120;
const PANEL_BLURB_SIZE = 13.5;
const PANEL_BLURB_LINES = 3;
const PANEL_THEN_SIZE = 12.5;

interface MHomeLandscapeProps {
  channels: Channel[];
  selectedIndex: number;
  onGate: (index: number) => void;
  onBoard: () => void;
  onPower: () => void;
  onService: () => void;
  onNotes: (p: Programme) => void;
  nowPlayingMap: Map<string, Programme>;
  upNextMap: Map<string, Programme>;
  clockNow: Date;
  height: number;
}

export function MHomeLandscape({ channels, selectedIndex, onGate, onBoard, onPower, onService, onNotes, nowPlayingMap, upNextMap, clockNow, height }: MHomeLandscapeProps) {
  const reducedMotion = useReducedMotion();
  const panelOpacity = useRef(new Animated.Value(1)).current;
  const selected = channels[Math.min(selectedIndex, channels.length - 1)];
  const now = selected ? nowPlayingMap.get(selected.id) : undefined;
  const next = selected ? upNextMap.get(selected.id) : undefined;

  useEffect(() => {
    panelOpacity.setValue(0.25);
    Animated.timing(panelOpacity, {
      toValue: 1,
      duration: motionDuration(BLOOM_RAMP_MS, reducedMotion),
      easing: FILAMENT_WARM_EASE,
      useNativeDriver: true,
    }).start();
    return () => panelOpacity.stopAnimation();
  }, [selectedIndex, panelOpacity, reducedMotion]);

  // The safe area, reasoned not seen (the web review has none). Held on its
  // side a notched iPhone reports its sensor housing as equal left and right
  // insets, and its home indicator as a bottom one. The gate's legends now
  // run to the plate's edge and THIS EVENING sits 9pt off the bottom, so
  // both would sit under them; the cabinet steps in by the insets instead.
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  // A small phone has no margin to spare: the walnut border yields 8pt a side.
  const margin = winW < 720 ? 16 : 24;
  const padLeft = Math.max(margin, insets.left);
  const padRight = Math.max(margin, insets.right);
  const sidePad: SidePad = { paddingLeft: padLeft, paddingRight: padRight };
  const railBottom = Math.max(9, insets.bottom);

  // What the masthead and the service rail take, and 6pt of air above and
  // below the plate so that a scaled plate never touches either.
  const scale = Math.min(1, (height - 118 - (railBottom - 9)) / PLATE_H);
  // The gate takes what the answering panel can spare past its reading
  // measure: never narrower than its legends need to be whole, and no wider
  // than they can use. Only a window too small for any phone caps it short.
  const rowW = winW - padLeft - padRight - margin;
  const namesKey = channels.map((ch) => ch.name).join('\n');
  const plateMinW = useMemo(
    () => plateNeed(namesKey.split('\n'), scale),
    [namesKey, scale],
  );
  const plateW = Math.min(
    Math.max(plateMinW, Math.min(PLATE_MAX_W, (rowW - PANEL_MEASURE) / scale)),
    Math.max(PLATE_DRAWN_W, (rowW - PANEL_FLOOR) / scale),
  );
  const panelW = Math.max(0, rowW - plateW * scale);
  const blurb = now?.description
    ? shortenBlurb(now.description, blurbBudget(Math.min(PANEL_MEASURE, panelW), PANEL_BLURB_SIZE, PANEL_BLURB_LINES))
    : '';
  // "Then comes …, at …" has two lines. On a narrow panel a long title
  // used to push the hour off the end of the second; the hour stays.
  const then = next
    ? thenComes(next.title, timeToProse(next.start), clockShort(next.start), blurbBudget(panelW, PANEL_THEN_SIZE, 2))
    : null;
  const meta = now
    ? [`${clockShort(now.start)} TO ${clockShort(now.stop)}`, now.subtitle?.toUpperCase()].filter(Boolean).join(' · ')
    : null;

  return (
    <View style={styles.cabinet}>
      <CabinetLight />
      <Masthead clockNow={clockNow} pad={sidePad} />

      <View style={[styles.midRow, sidePad, { gap: margin }]}>
        <Shifter channels={channels} selectedIndex={selectedIndex} onGate={onGate} scale={scale} width={plateW} />

        <Animated.View style={[styles.panel, { opacity: panelOpacity }]}>
          {selected && (
            <Pressable onPress={() => now && onNotes(now)}>
              <View style={styles.nowPlate}>
                <Jewel amplitude={0.03} />
                <Text style={styles.nowPlateText}>NOW ON THE AIR — CHANNEL {selected.number}</Text>
              </View>
              <Text style={styles.panelTitle} numberOfLines={2}>{now?.title ?? selected.name}</Text>
              {meta && <Text style={styles.panelMeta} numberOfLines={1}>{meta}</Text>}
              {blurb ? (
                <Text style={styles.panelBlurb} numberOfLines={PANEL_BLURB_LINES}>{blurb}</Text>
              ) : null}
              {then && (
                <Text style={styles.panelThen} numberOfLines={2}>
                  Then comes <Text style={styles.panelThenTitle}>{then.title}</Text>, at {then.when}.
                </Text>
              )}
            </Pressable>
          )}
        </Animated.View>
      </View>

      <View style={[styles.railBar, sidePad, { paddingBottom: railBottom }]}>
        <Text style={styles.railModel}>MODEL DS-{channels.length}/M · TRAVELING SET</Text>
        <Pressable onPress={onBoard} style={styles.railButton}>
          <Text style={styles.railButtonText}>THIS EVENING</Text>
        </Pressable>
        <Pressable onPress={onService} style={styles.railService}>
          <Text style={styles.railButtonText}>S · SERVICE</Text>
        </Pressable>
        <Pressable onPress={onPower} style={styles.railPower}>
          <Jewel size={6} />
          <Text style={styles.railModel}>POWER</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Portrait home — the column shift (9b) ──

interface MHomePortraitProps {
  channels: Channel[];
  /** The tuned station — wears the amber row and the lever. */
  tunedIndex: number;
  onTune: (index: number, origin?: 'register' | 'external') => void;
  nowPlayingMap: Map<string, Programme>;
  upNextMap: Map<string, Programme>;
  clockNow: Date;
  /** Dimmed beneath the pull-down shade. */
  dimmed?: boolean;
  /** Open the service panel from the receiver home. */
  onService?: () => void;
  /** THIS EVENING is the portrait register's only footer control. */
  onBoard?: () => void;
  entrance?: 'none' | 'stamp' | 'expand';
  expandFrom?: number;
  selectionRequest?: { index: number; token: number } | null;
}

// The column register's drawn sizes, the full plate and the compact one the
// watch seat uses. The row's layout and its engraving both read these, so
// the name is cut to the room the layout really leaves it.
const ROW = {
  full: { side: 52, sideRight: 4, pad: 14, gap: 12, numeral: 22, numeralSize: 20, name: 11, nameMin: 8, tracking: 1.8, onAir: 7, onAirTracking: 1.6 },
  compact: { side: 38, sideRight: 2, pad: 9, gap: 8, numeral: 18, numeralSize: 15, name: 9, nameMin: 7, tracking: 1.5, onAir: 6, onAirTracking: 1.2 },
} as const;
const ON_AIR = 'ON THE AIR';
/** The console's plate metals: dark stamped walnut at rest, backlit amber when tuned. */
const PLATE_REST = [walnut.grain, walnut.raised, walnut.panel] as const;
const PLATE_LIT = [amber.glow, amber.jewel, amber.deep] as const;

/** A row shorter than this cannot hold the name and the programme line both. */
const TWO_LINE_ROW = { full: 32, compact: 25 } as const;

/**
 * What is on, and when it ends. The ending is the one thing a viewer needs
 * from this line, so it is set whole and the title gives way before it.
 */
function NowLine({ now, next, style }: { now?: Programme; next?: Programme; style: StyleProp<TextStyle> }) {
  if (now) {
    return (
      <View style={styles.columnNowRow}>
        <Text style={[style, styles.columnNowTitle]} numberOfLines={1}>{now.title}</Text>
        {/* The word space before the dot is a margin, not a character: a
            leading space is not kept the same way by every platform. */}
        <Text style={[style, styles.columnNowUntil]}>{`· until ${clockShort(now.stop)}`}</Text>
      </View>
    );
  }
  if (next) {
    return (
      <View style={styles.columnNowRow}>
        <Text style={[style, styles.columnNowTitle]} numberOfLines={1}>{`then ${next.title}`}</Text>
      </View>
    );
  }
  return null;
}

interface MColumnRegisterProps {
  channels: Channel[];
  tunedIndex: number;
  onTune: (index: number, origin: 'register' | 'external') => void;
  nowPlayingMap: Map<string, Programme>;
  upNextMap: Map<string, Programme>;
  /** The watch composition gives the register the lower golden section. */
  compact?: boolean;
  /** False means the lever rests at a remembered position, but no station is live. */
  engaged?: boolean;
  stampOnMount?: boolean;
  onBoard?: () => void;
  /** Long-press on the footer: the little door on the back of the set. */
  onService?: () => void;
  selectionRequest?: { index: number; token: number } | null;
}

interface ColumnRowProps {
  channel: Channel;
  index: number;
  now?: Programme;
  next?: Programme;
  active: boolean;
  /** The lever rests here, but the set is not playing: the plate wears lit ink, no fill. */
  resting: boolean;
  pending: boolean;
  compact: boolean;
  /** The row's width, border to border. */
  rowWidth: number;
  /** False when the row is too short for the programme line; the name stays. */
  showNow: boolean;
  bloom: Animated.Value;
  stampOnMount: boolean;
  reducedMotion: boolean;
  onPress: () => void;
}

function ColumnRow({
  channel,
  index,
  now,
  next,
  active,
  resting,
  pending,
  compact,
  rowWidth,
  showNow,
  bloom,
  stampOnMount,
  reducedMotion,
  onPress,
}: ColumnRowProps) {
  const d = compact ? ROW.compact : ROW.full;
  // A numeral wider than one digit keeps its size and its centre line.
  const numeral = numeralCut(channel.number, d.numeral, d.numeralSize);
  // The room the name really has: the row, less its border and padding, the
  // numeral's column, and the ON THE AIR stamp when this row wears it.
  const onAirW = active ? engravedWidth(ON_AIR, d.onAir, d.onAirTracking, 400) + d.gap : 0;
  const nameRoom = rowWidth - 2 - 2 * d.pad - d.numeral - 2 * d.gap - 1 - onAirW;
  const name = useMemo(
    () => engrave(channel.name, nameRoom, {
      fontSize: d.name,
      minFontSize: d.nameMin,
      tracking: (size) => (d.tracking * size) / d.name,
      minTrackingRatio: 0.5,
      margin: 1,
    }),
    [channel.name, nameRoom, d],
  );
  // Lit ink is for a plate at rest. Under the bloom the row is turning amber
  // itself, and amber on amber would vanish.
  const lit = resting && !pending;
  const elapsed = showNow ? elapsedFraction(now, Date.now()) : null;

  const stamp = useRef(new Animated.Value(1)).current;
  const [printed, setPrinted] = useState(!stampOnMount || reducedMotion);

  useEffect(() => {
    if (!stampOnMount || reducedMotion) {
      setPrinted(true);
      stamp.setValue(1);
      return;
    }
    const timer = setTimeout(() => {
      stamp.setValue(1.035);
      setPrinted(true);
      Animated.timing(stamp, {
        toValue: 1,
        duration: STAMP_MS,
        easing: MECHANICAL_EASE_OUT,
        useNativeDriver: true,
      }).start();
    }, index * STAMP_STAGGER_MS);
    return () => {
      clearTimeout(timer);
      stamp.stopAnimation();
    };
  }, [index, reducedMotion, stamp, stampOnMount]);

  return (
    <View style={styles.columnRowSlot}>
      {printed && (
        <Animated.View style={[styles.columnRowStamp, { transform: [{ scaleX: stamp }, { scaleY: stamp }] }]}>
          <Pressable onPress={onPress} style={styles.columnRowPressable}>
            <LinearGradient
              colors={active ? PLATE_LIT : PLATE_REST}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={[styles.columnRow, compact && styles.columnRowCompact, active && styles.columnRowLit]}
            >
              {pending && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.columnBloom,
                    { transform: [{ scaleX: bloom }] },
                  ]}
                >
                  <LinearGradient
                    colors={['#f2bd6b', '#d99b3f']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              )}
              {!compact && (
                <>
                  <View style={[styles.plateScrew, styles.plateScrewTL]}><View style={styles.plateScrewSlot} /></View>
                  <View style={[styles.plateScrew, styles.plateScrewTR]}><View style={[styles.plateScrewSlot, styles.plateScrewSlotB]} /></View>
                  <View style={[styles.plateScrew, styles.plateScrewBL]}><View style={[styles.plateScrewSlot, styles.plateScrewSlotC]} /></View>
                  <View style={[styles.plateScrew, styles.plateScrewBR]}><View style={[styles.plateScrewSlot, styles.plateScrewSlotD]} /></View>
                </>
              )}
              <Text
                style={[
                  styles.columnNo,
                  { width: numeral.width, marginHorizontal: -numeral.bleed, fontSize: numeral.fontSize },
                  active && styles.columnInk,
                  lit && styles.columnLit,
                ]}
                numberOfLines={1}
              >
                {channel.number}
              </Text>
              <View style={[styles.columnDivider, (active || pending) && styles.columnDividerInk]} />
              <View style={styles.columnCopy}>
                <Text
                  style={[
                    styles.columnName,
                    { fontSize: name.fontSize, letterSpacing: name.letterSpacing },
                    active && styles.columnInk,
                    lit && styles.columnLit,
                  ]}
                  numberOfLines={1}
                >
                  {channel.name.toUpperCase()}
                </Text>
                {showNow && (
                  <NowLine
                    now={now}
                    next={next}
                    style={[styles.columnNow, compact && styles.columnNowCompact, active && styles.columnInkMuted]}
                  />
                )}
              </View>
              {active && <Text style={[styles.columnOnAir, compact && styles.columnOnAirCompact]}>{ON_AIR}</Text>}
              {elapsed !== null && (
                // How far the programme has run, along the plate's foot: the
                // same amber line the apron draws under the picture.
                <View pointerEvents="none" style={styles.columnRun}>
                  <View
                    style={[
                      styles.columnRunDone,
                      (active || pending) && styles.columnRunDoneInk,
                      { width: `${Math.round(elapsed * 1000) / 10}%` },
                    ]}
                  />
                </View>
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

/**
 * The lever's knob: a turned brass cap with a knurled skirt, lit from above
 * like everything else on the cabinet. The jewel sits in its crown.
 */
function ShiftKnob({ size }: { size: number }) {
  const c = size / 2;
  const ticks = Array.from({ length: 28 }, (_, i) => (i / 28) * Math.PI * 2);
  const rOut = c - 0.5;
  const rIn = c * 0.74;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <RadialGradient id="shiftKnobCap" cx="38%" cy="28%" r="80%">
          <Stop offset="0%" stopColor={brass.light} />
          <Stop offset="38%" stopColor={brass.shadow} />
          <Stop offset="100%" stopColor="#2c1e0e" />
        </RadialGradient>
        <RadialGradient id="shiftKnobWell" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#0e0803" />
          <Stop offset="70%" stopColor="#1c1208" />
          <Stop offset="100%" stopColor="#3a2a14" />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={rOut} fill="#2a1c0d" />
      {ticks.map((a, i) => (
        <Line
          key={i}
          x1={c + rIn * Math.cos(a)}
          y1={c + rIn * Math.sin(a)}
          x2={c + rOut * Math.cos(a)}
          y2={c + rOut * Math.sin(a)}
          stroke={Math.sin(a) < 0.2 ? 'rgba(241,229,207,0.34)' : 'rgba(241,229,207,0.14)'}
          strokeWidth={1}
        />
      ))}
      <Circle cx={c} cy={c} r={rIn} fill="url(#shiftKnobCap)" stroke="rgba(0,0,0,0.6)" strokeWidth={0.75} />
      <Circle cx={c} cy={c} r={c * 0.34} fill="url(#shiftKnobWell)" />
    </Svg>
  );
}

/** The portrait column register, shared by the un-tuned home and live watch seat. */
export function MColumnRegister({
  channels,
  tunedIndex,
  onTune,
  nowPlayingMap,
  upNextMap,
  compact = false,
  engaged = true,
  stampOnMount = false,
  onBoard,
  onService,
  selectionRequest,
}: MColumnRegisterProps) {
  const reducedMotion = useReducedMotion();
  const { width: winW } = useWindowDimensions();
  const [bodyH, setBodyH] = useState(0);
  const [bodyW, setBodyW] = useState(0);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const bloomCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (bloomCommitTimer.current) clearTimeout(bloomCommitTimer.current);
  }, []);
  const bloom = useRef(new Animated.Value(0)).current;
  const knobY = useRef(new Animated.Value(-100)).current;
  const knobReady = useRef(false);
  const safeTuned = Math.min(tunedIndex, channels.length - 1);
  const n = Math.max(1, channels.length);
  const d = compact ? ROW.compact : ROW.full;
  // Ten plates on a small phone: the air between them yields before a plate
  // drops under a finger's width.
  const pitchAt = (g: number) => (bodyH > 0 ? (bodyH - g * (n - 1)) / n : 0);
  const gap = compact || (bodyH > 0 && pitchAt(7) < 44) ? 4 : 7;
  const rowPitch = pitchAt(gap);
  // And if the room is shorter still (more stations than any phone has yet
  // been asked to carry), the programme line goes and the names stay whole.
  const showNow = rowPitch === 0 || rowPitch >= (compact ? TWO_LINE_ROW.compact : TWO_LINE_ROW.full);
  // The body's measured width; before the first layout, the window less the
  // padding each of the register's two seats gives it.
  const rowWidth = Math.max(0, (bodyW || winW - (compact ? 28 : 44)) - d.side - d.sideRight);
  const knobSize = compact ? 28 : 36;
  const displayIndex = pendingIndex ?? safeTuned;
  const knobCenter = rowPitch > 0 ? displayIndex * (rowPitch + gap) + rowPitch / 2 : -100;

  useEffect(() => {
    if (rowPitch <= 0 || pendingIndex !== null) return;
    const center = safeTuned * (rowPitch + gap) + rowPitch / 2;
    if (!knobReady.current) {
      knobReady.current = true;
      knobY.setValue(center);
      return;
    }
    Animated.timing(knobY, {
      toValue: center,
      duration: motionDuration(REGISTER_LINKAGE_MS, reducedMotion),
      easing: MECHANICAL_EASE_OUT,
      useNativeDriver: true,
    }).start();
    return () => knobY.stopAnimation();
  }, [gap, knobY, pendingIndex, reducedMotion, rowPitch, safeTuned]);

  const selectRow = (index: number, origin: 'register' | 'external' = 'register') => {
    pendingRef.current = index;
    setPendingIndex(index);
    bloom.stopAnimation();
    knobY.stopAnimation();
    bloom.setValue(0);
    const center = rowPitch > 0 ? index * (rowPitch + gap) + rowPitch / 2 : knobCenter;
    Animated.parallel([
      Animated.timing(bloom, {
        toValue: 1,
        duration: motionDuration(BLOOM_RAMP_MS, reducedMotion),
        easing: FILAMENT_WARM_EASE,
        useNativeDriver: true,
      }),
      Animated.timing(knobY, {
        toValue: center,
        duration: motionDuration(BLOOM_RAMP_MS, reducedMotion),
        easing: MECHANICAL_EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
    // The tune commit rides a timer, never the animation callback — a lying
    // `finished` on native must not swallow the channel change.
    if (bloomCommitTimer.current) clearTimeout(bloomCommitTimer.current);
    bloomCommitTimer.current = setTimeout(() => {
      bloomCommitTimer.current = null;
      if (pendingRef.current !== index) return;
      playSound('detent');
      pendingRef.current = null;
      setPendingIndex(null);
      onTune(index, origin);
    }, motionDuration(BLOOM_RAMP_MS, reducedMotion) + 20);
  };

  const handledSelectionToken = useRef<number | null>(null);
  useEffect(() => {
    if (!selectionRequest || handledSelectionToken.current === selectionRequest.token) return;
    handledSelectionToken.current = selectionRequest.token;
    selectRow(selectionRequest.index, 'external');
    // selectRow is deliberately interruptible and always uses current geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionRequest?.token]);

  useEffect(() => () => {
    pendingRef.current = null;
    bloom.stopAnimation();
    knobY.stopAnimation();
  }, [bloom, knobY]);

  return (
    <View style={styles.register}>
      <View style={[styles.columnHeadRow, compact && styles.columnHeadRowCompact]}>
        <View style={styles.columnHeadRule} />
        <Text style={[styles.columnHead, compact && styles.columnHeadCompact]}>
          COLUMN SHIFT — {countWord(channels.length)} POSITIONS
        </Text>
        <View style={styles.columnHeadRule} />
      </View>

      <View
        style={[styles.columnBody, compact && styles.columnBodyCompact]}
        onLayout={(e) => {
          setBodyH(e.nativeEvent.layout.height);
          setBodyW(e.nativeEvent.layout.width);
        }}
      >
        <View style={[styles.columnRail, compact && styles.columnRailCompact]} />
        {/* one drilled detent in the slot for every position the lever can rest in */}
        {rowPitch > 0 && channels.map((ch, i) => (
          <View
            key={ch.id}
            pointerEvents="none"
            style={[
              styles.columnDetent,
              compact && styles.columnDetentCompact,
              { top: i * (rowPitch + gap) + rowPitch / 2 - (compact ? 1.5 : 2) },
            ]}
          />
        ))}
        {rowPitch > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.columnKnobMover,
              compact && styles.columnKnobMoverCompact,
              { transform: [{ translateY: knobY }] },
            ]}
          >
            <View style={[styles.columnKnob, compact && styles.columnKnobCompact, { top: -knobSize / 2 }]}>
              <ShiftKnob size={knobSize - 2} />
            </View>
            <FilamentLamp
              lit={engaged || pendingIndex !== null}
              amplitude={0.075}
              style={[
                styles.columnKnobJewel,
                compact && styles.columnKnobJewelCompact,
                { top: compact ? -3 : -4 },
              ]}
            />
          </Animated.View>
        )}

        <View style={[styles.columnRows, compact && styles.columnRowsCompact, { gap }]}>
          {channels.map((ch, i) => {
            const now = nowPlayingMap.get(ch.id);
            const next = upNextMap.get(ch.id);
            return (
              <ColumnRow
                key={ch.id}
                channel={ch}
                index={i}
                now={now}
                next={next}
                active={engaged && i === safeTuned}
                resting={!engaged && i === safeTuned}
                pending={pendingIndex === i}
                compact={compact}
                rowWidth={rowWidth}
                showNow={showNow}
                bloom={bloom}
                stampOnMount={stampOnMount}
                reducedMotion={reducedMotion}
                onPress={() => selectRow(i)}
              />
            );
          })}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open This Evening"
        accessibilityHint="Press and hold for the service panel"
        disabled={!onBoard}
        onPress={onBoard}
        onLongPress={onService}
        style={[styles.portraitFoot, compact && styles.portraitFootCompact]}
      >
        <LinearGradient
          colors={PLATE_REST}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.portraitFootFace}
        />
        <View style={[styles.plateScrew, styles.footScrewL]}><View style={styles.plateScrewSlot} /></View>
        <View style={[styles.plateScrew, styles.footScrewR]}><View style={[styles.plateScrewSlot, styles.plateScrewSlotC]} /></View>
        <Text style={[styles.footEvening, compact && styles.footEveningCompact]}>THIS EVENING</Text>
      </Pressable>
    </View>
  );
}

export function MHomePortrait({
  channels,
  tunedIndex,
  onTune,
  nowPlayingMap,
  upNextMap,
  clockNow,
  dimmed,
  onBoard,
  onService,
  entrance = 'none',
  expandFrom = 180,
  selectionRequest,
}: MHomePortraitProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const entry = useRef(new Animated.Value(entrance === 'expand' && !reducedMotion ? 0 : 1)).current;

  useEffect(() => {
    if (entrance !== 'expand' || reducedMotion) {
      entry.setValue(1);
      return;
    }
    entry.setValue(0);
    Animated.timing(entry, {
      toValue: 1,
      duration: REGISTER_LINKAGE_MS,
      easing: MECHANICAL_EASE_OUT,
      useNativeDriver: true,
    }).start();
    return () => entry.stopAnimation();
  }, [entrance, entry, reducedMotion]);

  return (
    <View style={[styles.cabinet, dimmed && { opacity: 0.42 }]} pointerEvents={dimmed ? 'none' : 'auto'}>
      <CabinetLight portrait />
      <Animated.View
        style={[
          styles.portraitPad,
          // The top inset clears the status bar and the sensor housing. The
          // bottom one clears the home indicator, which would otherwise lie
          // across THIS EVENING: the watch seat already steps up for it.
          { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 14) },
          entrance === 'expand' && {
            transform: [
              { translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [expandFrom, 0] }) },
              { scaleY: entry.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
            ],
          },
        ]}
      >
        <Masthead clockNow={clockNow} compact />
        <MColumnRegister
          channels={channels}
          tunedIndex={tunedIndex}
          onTune={onTune}
          nowPlayingMap={nowPlayingMap}
          upNextMap={upNextMap}
          engaged={false}
          stampOnMount={entrance === 'stamp'}
          onBoard={onBoard}
          onService={onService}
          selectionRequest={selectionRequest}
        />
      </Animated.View>
    </View>
  );
}

/** The cabinet's light falls from up-left (landscape) or above (portrait). */
function CabinetLight({ portrait }: { portrait?: boolean }) {
  return (
    <>
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient
          id="mCabinetLight"
          cx={portrait ? '50%' : '30%'}
          cy={portrait ? '30%' : '40%'}
          rx={portrait ? '120%' : '90%'}
          ry={portrait ? '100%' : '120%'}
        >
          <Stop offset="0%" stopColor="#241810" />
          <Stop offset="55%" stopColor="#190f08" />
          <Stop offset="100%" stopColor="#120a05" />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#mCabinetLight)" />
    </Svg>
    <WalnutGrain />
    </>
  );
}

const styles = StyleSheet.create({
  cabinet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: walnut.void,
  },
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 14,
    zIndex: 2,
  },

  markShell: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
  },
  markFace: {
    borderRadius: 2,
    paddingVertical: 5,
    paddingHorizontal: 16,
  },
  markText: {
    fontFamily: fonts.plate,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 3.1,
    color: brass.bright,
  },
  // On a 375pt phone the masthead as drawn has under a point to spare at
  // "9:59 A.M." and is a point over at "10:00 A.M.". On the phone that
  // point simply overhangs, unseen. In a browser a line of text gives way
  // instead, and the hour's second digit folded the signature and the
  // clock onto two lines and pushed the whole bank down. Neither may fold.
  signature: {
    flexShrink: 0,
    fontFamily: fonts.signature,
    fontSize: 17,
    color: amber.needle,
    transform: [{ rotate: '-2deg' }],
    textShadowColor: 'rgba(223,161,79,0.35)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  mastClock: {
    marginLeft: 'auto',
    flexShrink: 0,
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 2.3,
    color: brass.mid,
  },
  screw: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: brass.shadow,
    borderWidth: 0.5,
    borderColor: brass.light,
  },
  midRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── shifter plate ──
  shifterPlate: {
    borderRadius: 6,
    borderWidth: 1,
    borderTopColor: 'rgba(241,229,207,0.16)',
    borderLeftColor: 'rgba(241,229,207,0.09)',
    borderRightColor: 'rgba(0,0,0,0.7)',
    borderBottomColor: 'rgba(0,0,0,0.85)',
    backgroundColor: '#241809',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  shifterFace: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 5,
  },
  shifterHead: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 12,
    textAlign: 'center',
    fontFamily: fonts.plate,
    fontSize: 7.5,
    letterSpacing: 2.4,
    color: brass.mid,
  },
  slot: {
    position: 'absolute',
    top: SLOT_TOP,
    width: 12,
    height: SLOT_H,
    backgroundColor: '#170e07',
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 7,
  },
  rail: {
    position: 'absolute',
    top: RAIL_Y,
    height: 12,
    backgroundColor: '#170e07',
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 7,
  },
  gateTap: {
    position: 'absolute',
  },
  gateLegend: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  gateNumeral: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: LEGEND_NUMERAL,
    lineHeight: LEGEND_NUMERAL_LINE,
    textAlign: 'center',
    color: brass.mid,
  },
  gateName: {
    alignSelf: 'stretch',
    textAlign: 'center',
    fontFamily: fonts.plate,
    fontWeight: '700',
    color: brass.mid,
  },
  gateLabelLit: {
    color: amber.jewel,
    textShadowColor: 'rgba(240,184,98,0.8)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  knob: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3a2a14',
    borderWidth: 1,
    borderColor: walnut.void,
    shadowColor: amber.jewel,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  knobJewel: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: amber.jewel,
    shadowColor: amber.glow,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 9,
  },
  shifterFoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    textAlign: 'center',
    fontFamily: fonts.plate,
    fontSize: 7,
    letterSpacing: 2,
    color: '#6e5f4b',
  },

  // ── the answering panel ──
  panel: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  nowPlate: {
    alignSelf: 'flex-start',
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
  nowPlateText: {
    fontFamily: fonts.plate,
    fontSize: 8.5,
    letterSpacing: 2.4,
    color: brass.bright,
  },
  panelTitle: {
    fontFamily: fonts.plate,
    fontWeight: '600',
    fontSize: 30,
    lineHeight: 36,
    paddingBottom: 6,
    color: cream,
    marginTop: 12,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 2 },
  },
  panelMeta: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 2.2,
    color: brass.muted,
    marginTop: 4,
  },
  panelBlurb: {
    fontFamily: fonts.speech,
    fontSize: PANEL_BLURB_SIZE,
    lineHeight: 21,
    color: '#cbba99',
    marginTop: 10,
    maxWidth: PANEL_MEASURE,
  },
  panelThen: {
    fontFamily: fonts.speech,
    fontSize: PANEL_THEN_SIZE,
    color: brass.muted,
    marginTop: 8,
  },
  panelThenTitle: {
    fontWeight: '600',
    color: cream,
  },

  // ── service rail ──
  railBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.8)',
    zIndex: 2,
  },
  railModel: {
    fontFamily: fonts.plate,
    fontSize: 7,
    letterSpacing: 1.8,
    color: brass.mid,
  },
  railButton: {
    marginLeft: 'auto',
    height: 44,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a1c0e',
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 5,
  },
  railButtonText: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 1.6,
    color: brass.bright,
  },
  railService: {
    height: 32,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#24180c',
    borderWidth: 1,
    borderColor: walnut.void,
  },
  railPower: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 6,
  },

  // ── portrait / column shift ──
  portraitPad: {
    flex: 1,
    paddingHorizontal: 22,
  },
  register: {
    flex: 1,
    minHeight: 0,
  },
  columnHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  columnHeadRowCompact: {
    marginTop: 8,
  },
  columnHeadRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: brass.shadow,
  },
  columnHead: {
    fontFamily: fonts.plate,
    fontSize: 7.5,
    letterSpacing: 2.5,
    color: brass.mid,
    textAlign: 'center',
  },
  columnHeadCompact: {
    fontSize: 7,
    letterSpacing: 2.2,
  },
  columnBody: {
    flex: 1,
    marginTop: 10,
  },
  columnBodyCompact: {
    marginTop: 6,
  },
  columnRail: {
    position: 'absolute',
    left: 14,
    top: 10,
    bottom: 10,
    width: 12,
    // A slot milled into the cabinet: its upper lip is in shade, its lower
    // lip catches the light.
    backgroundColor: '#0c0602',
    borderWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.85)',
    borderLeftColor: 'rgba(0,0,0,0.7)',
    borderRightColor: 'rgba(241,229,207,0.1)',
    borderBottomColor: 'rgba(241,229,207,0.16)',
    borderRadius: 7,
  },
  columnDetent: {
    position: 'absolute',
    left: 18,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: brass.shadow,
  },
  columnDetentCompact: {
    left: 12,
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  columnRailCompact: {
    left: 9,
    top: 6,
    bottom: 6,
    width: 9,
  },
  columnKnobMover: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 40,
    height: 0,
    zIndex: 3,
  },
  columnKnobMoverCompact: {
    width: 28,
  },
  columnKnob: {
    position: 'absolute',
    left: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3a2a14',
    borderWidth: 1,
    borderColor: walnut.void,
    shadowColor: amber.jewel,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  columnKnobCompact: {
    left: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  columnKnobJewel: {
    position: 'absolute',
    left: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: amber.jewel,
    shadowColor: amber.glow,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 9,
  },
  columnKnobJewelCompact: {
    left: 11,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  columnRows: {
    flex: 1,
    marginLeft: ROW.full.side,
    marginRight: ROW.full.sideRight,
  },
  columnRowsCompact: {
    marginLeft: ROW.compact.side,
    marginRight: ROW.compact.sideRight,
  },
  columnRowSlot: {
    flex: 1,
  },
  columnRowStamp: {
    flex: 1,
  },
  columnRowPressable: {
    flex: 1,
  },
  columnRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW.full.gap,
    paddingHorizontal: ROW.full.pad,
    // The console plate's bevel: the edges that face the light are bright,
    // the edges that turn from it are in shade.
    borderWidth: 1,
    borderTopColor: 'rgba(241,229,207,0.16)',
    borderLeftColor: 'rgba(241,229,207,0.09)',
    borderRightColor: 'rgba(0,0,0,0.7)',
    borderBottomColor: 'rgba(0,0,0,0.85)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  columnDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 9,
    backgroundColor: brass.shadow,
    opacity: 0.8,
  },
  columnDividerInk: {
    backgroundColor: 'rgba(26,16,6,0.32)',
    opacity: 1,
  },
  columnRun: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  columnRunDone: {
    height: 2,
    backgroundColor: amber.needle,
    opacity: 0.85,
  },
  columnRunDoneInk: {
    backgroundColor: '#2a1a08',
    opacity: 0.55,
  },
  plateScrew: {
    position: 'absolute',
    zIndex: 2,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brass.mid,
    borderWidth: 0.5,
    borderColor: walnut.void,
  },
  // Slots sit at their own angles: aligned slots are the tell of a fake panel.
  plateScrewSlot: {
    width: 3.5,
    height: 1,
    backgroundColor: walnut.deep,
    transform: [{ rotate: '22deg' }],
  },
  plateScrewSlotB: { transform: [{ rotate: '-48deg' }] },
  plateScrewSlotC: { transform: [{ rotate: '74deg' }] },
  plateScrewSlotD: { transform: [{ rotate: '-11deg' }] },
  plateScrewTL: { top: 3, left: 3 },
  plateScrewTR: { top: 3, right: 3 },
  plateScrewBL: { bottom: 4, left: 3 },
  plateScrewBR: { bottom: 4, right: 3 },
  footScrewL: { left: 7, top: '50%', marginTop: -2.5 },
  footScrewR: { right: 7, top: '50%', marginTop: -2.5 },
  columnRowCompact: {
    gap: ROW.compact.gap,
    paddingHorizontal: ROW.compact.pad,
    borderRadius: 3,
  },
  columnRowLit: {
    shadowColor: amber.jewel,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  columnBloom: {
    ...StyleSheet.absoluteFillObject,
    transformOrigin: '0% 50%',
  },
  columnCopy: {
    flex: 1,
    minWidth: 0,
  },
  columnInk: {
    color: '#2a1a08',
  },
  columnInkMuted: {
    color: 'rgba(42,26,8,0.75)',
  },
  // The gate's lit legend, on the column: amber ink and its glow, no fill.
  columnLit: {
    color: amber.jewel,
    textShadowColor: 'rgba(240,184,98,0.8)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  // The numeral's size and box, and the name's size and tracking, are set
  // on the row itself: they are cut to the station (see ColumnRow).
  columnNo: {
    fontFamily: fonts.plate,
    fontWeight: '600',
    color: brass.muted,
    textAlign: 'center',
  },
  columnName: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    color: brass.bright,
  },
  columnNowRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  columnNow: {
    fontFamily: fonts.speech,
    fontSize: 11.5,
    color: brass.mid,
    marginTop: 2,
  },
  columnNowCompact: {
    fontSize: 9.5,
    marginTop: 0,
  },
  columnNowTitle: {
    flexShrink: 1,
    minWidth: 0,
  },
  columnNowUntil: {
    flexShrink: 0,
    marginLeft: 3,
  },
  columnOnAir: {
    fontFamily: fonts.plate,
    fontSize: ROW.full.onAir,
    letterSpacing: ROW.full.onAirTracking,
    color: 'rgba(42,26,8,0.7)',
  },
  columnOnAirCompact: {
    fontSize: ROW.compact.onAir,
    letterSpacing: ROW.compact.onAirTracking,
  },
  portraitFoot: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    minWidth: 180,
    minHeight: 44,
    marginTop: 12,
    paddingVertical: 9,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderTopColor: 'rgba(241,229,207,0.16)',
    borderLeftColor: 'rgba(241,229,207,0.09)',
    borderRightColor: 'rgba(0,0,0,0.7)',
    borderBottomColor: 'rgba(0,0,0,0.85)',
    borderRadius: 4,
    backgroundColor: '#2a1c0e',
    overflow: 'hidden',
  },
  portraitFootFace: {
    ...StyleSheet.absoluteFillObject,
  },
  portraitFootCompact: {
    minWidth: 154,
    minHeight: 40,
    marginTop: 6,
    paddingVertical: 7,
  },
  footEvening: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 9.5,
    letterSpacing: 2.2,
    color: brass.bright,
  },
  footEveningCompact: {
    fontSize: 9,
    letterSpacing: 2,
  },
});
