import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, amber, cream, fonts } from '../../constants/ds6';
import { playSound } from '../../utils/sound';
import { timeToProse, countWord } from '../../utils/prose';
import type { Channel, Programme } from '../../types';

/**
 * The DS-8/M home — the traveling set's receiver, both uprightnesses.
 *
 * Landscape (9a): the dial becomes a floor shifter. Four slots, two
 * gates each — eight forward speeds when the eighth station arrives.
 * Drag isn't required: run the gate with a sideways swipe, or tap a
 * gate and the lever throws itself there, through neutral, and settles
 * with the same detent the big dial uses.
 *
 * Portrait (9b): the column shift. One position per station, the
 * lever on its rail beside the tuned row, and a courtesy plate
 * suggesting you lay the set on its side for the full receiver.
 */

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function clock12(d: Date): string {
  const h = d.getHours() % 12 || 12;
  const mer = d.getHours() < 12 ? 'A.M.' : 'P.M.';
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${mer}`;
}

function clockShort(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** A small stamped screwhead, drawn cheap. */
function Screw({ style }: { style?: object }) {
  return <View style={[styles.screw, style]} />;
}

/** The amber jewel — this lamp means it's real. */
function Jewel({ size = 7 }: { size?: number }) {
  return (
    <View
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

/** The masthead: the D S , P plate, the one chrome signature, the hour. */
function Masthead({ clockNow, compact }: { clockNow: Date; compact?: boolean }) {
  return (
    <View style={styles.masthead}>
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

const PLATE_W = 372;
const PLATE_H = 272;
const SLOT_TOP = 64;
const SLOT_H = 150;
const RAIL_Y = 133; // the neutral crossbar
const KNOB = 46;

interface ShifterProps {
  channels: Channel[];
  selectedIndex: number;
  onGate: (index: number) => void;
  scale: number;
}

function Shifter({ channels, selectedIndex, onGate, scale }: ShifterProps) {
  const slots = Math.max(1, Math.ceil(channels.length / 2));
  const spacing = slots > 1 ? (PLATE_W - 104) / (slots - 1) : 0;
  const slotX = (s: number) => 52 + s * spacing;
  const gatePos = (i: number) => {
    const s = Math.floor(i / 2);
    const top = i % 2 === 0;
    return { x: slotX(s), y: top ? SLOT_TOP + 20 : SLOT_TOP + SLOT_H - 20 };
  };

  const target = gatePos(Math.min(selectedIndex, channels.length - 1));
  const pos = useRef(new Animated.ValueXY(target)).current;
  const prevIndex = useRef(selectedIndex);

  // The throw: pull to neutral, run the gate, push home. Detent on
  // settle — the same click the big dial makes.
  useEffect(() => {
    if (prevIndex.current === selectedIndex) return;
    const from = gatePos(prevIndex.current);
    const to = gatePos(selectedIndex);
    prevIndex.current = selectedIndex;
    const leg = (x: number, y: number, ms: number) =>
      Animated.timing(pos, { toValue: { x, y }, duration: ms, useNativeDriver: false });
    Animated.sequence([
      leg(from.x, RAIL_Y + 6, 90),
      leg(to.x, RAIL_Y + 6, 110),
      leg(to.x, to.y, 90),
    ]).start(() => playSound('detent'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  return (
    <View style={{ width: PLATE_W * scale, height: PLATE_H * scale }}>
      <View style={[styles.shifterPlate, { transform: [{ scale }], width: PLATE_W, height: PLATE_H }]}>
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
        <View style={styles.rail} />

        {/* gear labels, tappable — the gate answers the finger */}
        {channels.map((ch, i) => {
          const s = Math.floor(i / 2);
          const top = i % 2 === 0;
          const active = i === selectedIndex;
          return (
            <Pressable
              key={ch.id}
              onPress={() => onGate(i)}
              style={[styles.gateTap, { left: slotX(s) - spacing / 2 + 4, width: spacing - 8, top: top ? 24 : PLATE_H / 2 + 2, height: PLATE_H / 2 - 26 }]}
            >
              <Text
                style={[
                  styles.gateLabel,
                  top ? { top: 12 } : { bottom: 12 },
                  active && styles.gateLabelLit,
                ]}
                numberOfLines={1}
              >
                {ch.number} · {ch.name.toUpperCase()}
              </Text>
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
        />
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

interface MHomeLandscapeProps {
  channels: Channel[];
  selectedIndex: number;
  onGate: (index: number) => void;
  onBoard: () => void;
  onPower: () => void;
  onNotes: (p: Programme) => void;
  nowPlayingMap: Map<string, Programme>;
  upNextMap: Map<string, Programme>;
  clockNow: Date;
  height: number;
}

export function MHomeLandscape({ channels, selectedIndex, onGate, onBoard, onPower, onNotes, nowPlayingMap, upNextMap, clockNow, height }: MHomeLandscapeProps) {
  const panelOpacity = useRef(new Animated.Value(1)).current;
  const selected = channels[Math.min(selectedIndex, channels.length - 1)];
  const now = selected ? nowPlayingMap.get(selected.id) : undefined;
  const next = selected ? upNextMap.get(selected.id) : undefined;

  useEffect(() => {
    panelOpacity.setValue(0.25);
    Animated.timing(panelOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [selectedIndex, panelOpacity]);

  const scale = Math.min(1, (height - 112) / PLATE_H);
  const meta = now
    ? [`${clockShort(now.start)} TO ${clockShort(now.stop)}`, now.subtitle?.toUpperCase()].filter(Boolean).join(' · ')
    : null;

  return (
    <View style={styles.cabinet}>
      <CabinetLight />
      <Masthead clockNow={clockNow} />

      <View style={styles.midRow}>
        <Shifter channels={channels} selectedIndex={selectedIndex} onGate={onGate} scale={scale} />

        <Animated.View style={[styles.panel, { opacity: panelOpacity }]}>
          {selected && (
            <Pressable onPress={() => now && onNotes(now)}>
              <View style={styles.nowPlate}>
                <Jewel />
                <Text style={styles.nowPlateText}>NOW ON THE AIR — CHANNEL {selected.number}</Text>
              </View>
              <Text style={styles.panelTitle} numberOfLines={2}>{now?.title ?? selected.name}</Text>
              {meta && <Text style={styles.panelMeta} numberOfLines={1}>{meta}</Text>}
              {now?.description ? (
                <Text style={styles.panelBlurb} numberOfLines={3}>{now.description}</Text>
              ) : null}
              {next && (
                <Text style={styles.panelThen} numberOfLines={2}>
                  Then comes <Text style={styles.panelThenTitle}>{next.title}</Text>, at {timeToProse(next.start)}.
                </Text>
              )}
            </Pressable>
          )}
        </Animated.View>
      </View>

      <View style={styles.railBar}>
        <Text style={styles.railModel}>MODEL DS-{channels.length}/M · TRAVELING SET</Text>
        <Pressable onPress={onBoard} style={styles.railButton}>
          <Text style={styles.railButtonText}>THIS EVENING</Text>
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
  onTune: (index: number) => void;
  nowPlayingMap: Map<string, Programme>;
  upNextMap: Map<string, Programme>;
  clockNow: Date;
  /** Courtesy mode: the picture's sound carries on underneath. */
  courtesy?: boolean;
  /** Dimmed beneath the pull-down shade. */
  dimmed?: boolean;
}

function nowLine(now?: Programme, next?: Programme): string {
  if (now) return `${now.title} · until ${clockShort(now.stop)}`;
  if (next) return `then ${next.title}`;
  return '';
}

export function MHomePortrait({ channels, tunedIndex, onTune, nowPlayingMap, upNextMap, clockNow, dimmed }: MHomePortraitProps) {
  const [bodyH, setBodyH] = useState(0);
  const safeTuned = Math.min(tunedIndex, channels.length - 1);
  const n = Math.max(1, channels.length);
  const gap = 7;
  const rowPitch = bodyH > 0 ? (bodyH - gap * (n - 1)) / n : 0;
  const knobCenter = rowPitch > 0 ? safeTuned * (rowPitch + gap) + rowPitch / 2 : -100;

  return (
    <View style={[styles.cabinet, dimmed && { opacity: 0.42 }]} pointerEvents={dimmed ? 'none' : 'auto'}>
      <CabinetLight portrait />
      <View style={styles.portraitPad}>
        <Masthead clockNow={clockNow} compact />

        {/* the courtesy plate */}
        <View style={styles.courtesy}>
          <View style={styles.courtesyGlyph} />
          <View style={{ flex: 1 }}>
            <Text style={styles.courtesyHead}>TURN THE SET ON ITS SIDE</Text>
            <Text style={styles.courtesyProse}>the full receiver plays in landscape; upright shows the column shift</Text>
          </View>
        </View>

        <Text style={styles.columnHead}>COLUMN SHIFT — {countWord(channels.length)} POSITIONS</Text>

        <View style={styles.columnBody} onLayout={(e) => setBodyH(e.nativeEvent.layout.height)}>
          {/* the rail and the lever, resting at the tuned row */}
          <View style={styles.columnRail} />
          {rowPitch > 0 && (
            <>
              <View style={[styles.columnKnob, { top: knobCenter - 18 }]} />
              <View style={[styles.columnKnobJewel, { top: knobCenter - 4 }]} />
            </>
          )}

          <View style={styles.columnRows}>
            {channels.map((ch, i) => {
              const active = i === safeTuned;
              const now = nowPlayingMap.get(ch.id);
              const next = upNextMap.get(ch.id);
              return (
                <Pressable key={ch.id} onPress={() => onTune(i)} style={{ flex: 1 }}>
                  <LinearGradient
                    colors={active ? ['#f2bd6b', '#d99b3f'] : ['#2e2013', '#171006']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={[styles.columnRow, active && styles.columnRowLit]}
                  >
                    <Text style={[styles.columnNo, active && { color: '#2a1a08' }]}>{ch.number}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.columnName, active && { color: '#2a1a08' }]} numberOfLines={1}>
                        {ch.name.toUpperCase()}
                      </Text>
                      <Text style={[styles.columnNow, active && { color: 'rgba(42,26,8,0.75)' }]} numberOfLines={1}>
                        {nowLine(now, next)}
                      </Text>
                    </View>
                    {active && <Text style={styles.columnOnAir}>ON THE AIR</Text>}
                  </LinearGradient>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.portraitFoot}>
          <Text style={styles.footHint}>TAP A POSITION TO TUNE</Text>
          <Text style={styles.footHint}>·</Text>
          <Text style={styles.footHint}>THIS EVENING — PULL DOWN</Text>
        </View>
      </View>
    </View>
  );
}

/** The cabinet's light falls from up-left (landscape) or above (portrait). */
function CabinetLight({ portrait }: { portrait?: boolean }) {
  return (
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
    paddingHorizontal: 24,
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
  signature: {
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
    paddingHorizontal: 24,
    gap: 24,
  },

  // ── shifter plate ──
  shifterPlate: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: walnut.void,
    backgroundColor: '#241809',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
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
    left: 46,
    right: 46,
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
  gateLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 7.5,
    letterSpacing: 1,
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
    fontSize: 13.5,
    lineHeight: 21,
    color: '#cbba99',
    marginTop: 10,
    maxWidth: 340,
  },
  panelThen: {
    fontFamily: fonts.speech,
    fontSize: 12.5,
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
    paddingHorizontal: 24,
    paddingVertical: 9,
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
    paddingBottom: 14,
  },
  courtesy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    marginHorizontal: 2,
    backgroundColor: '#241809',
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 5,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  courtesyGlyph: {
    width: 24,
    height: 15,
    borderWidth: 1.5,
    borderColor: amber.needle,
    borderRadius: 3,
    shadowColor: amber.needle,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  courtesyHead: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 2.2,
    color: amber.needle,
  },
  courtesyProse: {
    fontFamily: fonts.speech,
    fontSize: 12,
    color: brass.muted,
    marginTop: 3,
  },
  columnHead: {
    fontFamily: fonts.plate,
    fontSize: 7.5,
    letterSpacing: 2.5,
    color: brass.mid,
    textAlign: 'center',
    marginTop: 18,
  },
  columnBody: {
    flex: 1,
    marginTop: 10,
  },
  columnRail: {
    position: 'absolute',
    left: 14,
    top: 10,
    bottom: 10,
    width: 12,
    backgroundColor: '#170e07',
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 7,
  },
  columnKnob: {
    position: 'absolute',
    left: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3a2a14',
    borderWidth: 1,
    borderColor: walnut.void,
    shadowColor: amber.jewel,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
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
  columnRows: {
    flex: 1,
    marginLeft: 52,
    gap: 7,
  },
  columnRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 4,
  },
  columnRowLit: {
    shadowColor: amber.jewel,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  columnNo: {
    fontFamily: fonts.plate,
    fontWeight: '600',
    fontSize: 20,
    color: brass.muted,
    width: 22,
    textAlign: 'center',
  },
  columnName: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1.8,
    color: brass.bright,
  },
  columnNow: {
    fontFamily: fonts.speech,
    fontSize: 11.5,
    color: brass.mid,
    marginTop: 2,
  },
  columnOnAir: {
    fontFamily: fonts.plate,
    fontSize: 7,
    letterSpacing: 1.6,
    color: 'rgba(42,26,8,0.7)',
  },
  portraitFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.8)',
  },
  footHint: {
    fontFamily: fonts.plate,
    fontSize: 7,
    letterSpacing: 1.8,
    color: '#6e5f4b',
  },
});
