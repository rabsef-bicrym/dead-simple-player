import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, amber, cream, fonts } from '../../constants/ds6';
import { STEP, flapChars, drumNeed, Cell } from '../ds6/flap';
import { playSound } from '../../utils/sound';
import { FilamentLamp } from '../../ui/FilamentLamp';
import {
  MECHANICAL_EASE_OUT,
  ROLLER_DOWN_MS,
  ROLLER_RELEASE_EASE,
  ROLLER_REWIND_EASE,
  ROLLER_SETTLE_MS,
  ROLLER_UP_MS,
  motionDuration,
  useReducedMotion,
} from '../../ui/motion';
import type { Channel, Programme } from '../../types';

/**
 * This Evening on the traveling set (9e / 9f / 10c).
 *
 * Landscape gets the full departure board: time flaps, twenty title
 * modules, the year, the note in plain Newsreader (flaps are for what
 * changes; prose is for what reads). Portrait gets the evening pillar,
 * pulled down over the column shift like a window shade — the roller
 * bar and its ring pull roll it home.
 */

const ROWS = 7;
const LEN_L = { time: 5, title: 20, year: 4 };
const LEN_P = { time: 5, title: 16, year: 4 };

interface MRow {
  time: string;
  title: string;
  year: string;
  note: string;
  live: boolean;
  past: boolean;
  next: boolean;
  prog?: Programme;
}

const BLANK: MRow = { time: '', title: '', year: '', note: '', live: false, past: false, next: false };

function clockShort(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function clock12(d: Date): string {
  const mer = d.getHours() < 12 ? 'A.M.' : 'P.M.';
  return `${clockShort(d)} ${mer}`;
}

/** The evening, deduped of glue and conjoined of back-to-back repeats. */
function eveningFor(programmes: Programme[], channel?: Channel): Programme[] {
  if (!channel) return [];
  const scheduled = programmes
    .filter((p) => p.channelId === channel.id && !/interstitial/i.test(p.title))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const progs: Programme[] = [];
  for (const p of scheduled) {
    const last = progs[progs.length - 1];
    if (last && last.title === p.title && p.start.getTime() - last.stop.getTime() < 15 * 60_000) {
      progs[progs.length - 1] = { ...last, stop: p.stop };
    } else {
      progs.push(p);
    }
  }
  return progs;
}

function rowsFor(progs: Programme[], liveIdx: number, scroll: number): MRow[] {
  const start = (liveIdx < 0 ? 0 : liveIdx - 2) + scroll;
  return Array.from({ length: ROWS }, (_, k) => {
    const idx = start + k;
    const p = idx >= 0 ? progs[idx] : undefined;
    if (!p) return BLANK;
    return {
      time: clockShort(p.start),
      title: p.title,
      year: p.year ?? '',
      note: p.description ?? p.subtitle ?? '',
      live: idx === liveIdx,
      past: liveIdx >= 0 && idx < liveIdx,
      next: idx === liveIdx + 1,
      prog: p,
    };
  });
}

function rowsKey(rows: MRow[]): string {
  return rows.map((r) => `${r.time}|${r.title}|${r.year}`).join('~');
}

function maxNeed(prev: MRow[], cur: MRow[], LEN: typeof LEN_L): number {
  let max = 0;
  for (let r = 0; r < prev.length; r++) {
    max = Math.max(
      max,
      drumNeed(prev[r].time, cur[r].time, LEN.time, true),
      drumNeed(prev[r].title, cur[r].title, LEN.title, false),
      drumNeed(prev[r].year, cur[r].year, LEN.year, true),
    );
  }
  return max;
}

interface MBoardProps {
  channels: Channel[];
  boardIndex: number;
  onSelectChannel: (index: number) => void;
  programmes: Programme[];
  scroll: number;
  landscape: boolean;
  onTune: () => void;
  onClose: () => void;
  onNotes: (p: Programme) => void;
  clockNow: Date;
  /** Portrait: the shade's height in points. */
  height: number;
  /** Portrait: the shade roller is seated at the top edge of the video. */
  top?: number;
  /** Parent gestures request the same sprung close used by the ring. */
  closing?: boolean;
}

export function MBoard({ channels, boardIndex, onSelectChannel, programmes, scroll, landscape, onTune, onClose, onNotes, clockNow, height, top = 0, closing = false }: MBoardProps) {
  const reducedMotion = useReducedMotion();
  const [shadeSettled, setShadeSettled] = useState(landscape || reducedMotion);
  const LEN = landscape ? LEN_L : LEN_P;
  const channel = channels[boardIndex];
  const progs = eveningFor(programmes, channel);
  const liveIdx = progs.findIndex((p) => p.start.getTime() <= clockNow.getTime() && p.stop.getTime() > clockNow.getTime());
  const target = shadeSettled ? rowsFor(progs, liveIdx, scroll) : Array.from({ length: ROWS }, () => BLANK);
  const targetKey = rowsKey(target);

  // The drum machinery — same cadence as the console board.
  const prevRef = useRef<MRow[]>(target);
  const curRef = useRef<MRow[]>(target);
  const keyRef = useRef(targetKey);
  const causeRef = useRef({ boardIndex, scroll });
  const needRef = useRef(0);
  const [ticks, setTicks] = useState(Number.MAX_SAFE_INTEGER);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Paging repositions plainly — during render, like the console board.
  if (targetKey !== keyRef.current) {
    const scrolled = scroll !== causeRef.current.scroll && boardIndex === causeRef.current.boardIndex;
    if (scrolled) {
      prevRef.current = target;
      curRef.current = target;
      keyRef.current = targetKey;
      causeRef.current = { boardIndex, scroll };
    }
  }

  useEffect(() => {
    if (targetKey !== keyRef.current) {
      if (reducedMotion) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        prevRef.current = target;
        curRef.current = target;
        setTicks(Number.MAX_SAFE_INTEGER);
        keyRef.current = targetKey;
        causeRef.current = { boardIndex, scroll };
        return;
      }
      prevRef.current = curRef.current;
      curRef.current = target;
      needRef.current = maxNeed(prevRef.current, target, LEN);
      playSound('clatter');
      setTicks(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTicks((t) => {
          if (t + 1 >= needRef.current && timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return t + 1;
        });
      }, STEP);
      keyRef.current = targetKey;
    }
    causeRef.current = { boardIndex, scroll };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, boardIndex, scroll, reducedMotion]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // The shade comes down when the board mounts in portrait.
  const shadeY = useRef(new Animated.Value(landscape ? 0 : -height)).current;
  useEffect(() => {
    shadeY.stopAnimation();
    if (landscape) {
      shadeY.setValue(0);
      setShadeSettled(true);
      return;
    }
    setShadeSettled(reducedMotion);
    shadeY.setValue(-height);
    Animated.sequence([
      Animated.timing(shadeY, {
        toValue: reducedMotion ? 0 : 6,
        duration: motionDuration(ROLLER_DOWN_MS - ROLLER_SETTLE_MS, reducedMotion),
        easing: ROLLER_RELEASE_EASE,
        useNativeDriver: true,
      }),
      Animated.timing(shadeY, {
        toValue: 0,
        duration: motionDuration(ROLLER_SETTLE_MS, reducedMotion),
        easing: MECHANICAL_EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setShadeSettled(true);
    });
    return () => shadeY.stopAnimation();
  }, [height, landscape, reducedMotion, shadeY]);

  const rollHome = () => {
    if (landscape) {
      onClose();
      return;
    }
    setShadeSettled(false);
    shadeY.stopAnimation();
    Animated.timing(shadeY, {
      toValue: -height,
      duration: motionDuration(ROLLER_UP_MS, reducedMotion),
      easing: ROLLER_REWIND_EASE,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  useEffect(() => {
    if (closing) rollHome();
    // rollHome intentionally follows the current interrupted position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  const prev = prevRef.current;
  const cur = curRef.current;

  const prevIdx = (boardIndex - 1 + channels.length) % channels.length;
  const nextIdx = (boardIndex + 1) % channels.length;

  const tabs = (
    <View style={styles.tabs}>
      <Pressable onPress={() => onSelectChannel(prevIdx)} hitSlop={10} style={styles.tabArrowChip}>
        <View style={[styles.tabArrowTri, styles.tabArrowTriLeft]} />
      </Pressable>
      {[prevIdx, boardIndex, nextIdx].map((i, k) => {
        const active = k === 1;
        const ch = channels[i];
        if (!ch) return null;
        return (
          <Pressable key={`${i}-${k}`} onPress={() => onSelectChannel(i)}>
            <LinearGradient
              colors={active ? ['#f2bd6b', '#d99b3f'] : [walnut.grain, '#231507']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, { color: active ? '#2a1a08' : brass.mid }]}>
                {ch.number} · {ch.name.toUpperCase()}
              </Text>
            </LinearGradient>
          </Pressable>
        );
      })}
      <Pressable onPress={() => onSelectChannel(nextIdx)} hitSlop={10} style={styles.tabArrowChip}>
        <View style={[styles.tabArrowTri, styles.tabArrowTriRight]} />
      </Pressable>
      {landscape && <Text style={styles.tabHint}>SWIPE FOR THE OTHER CHANNELS</Text>}
    </View>
  );

  const rows = cur.map((row, r) => {
    const pRow = prev[r];
    const timeChars = flapChars(pRow.time, row.time, LEN.time, ticks, true);
    const titleChars = flapChars(pRow.title, row.title, LEN.title, ticks, false);
    const yearChars = flapChars(pRow.year, row.year, LEN.year, ticks, true);
    const timeColor = row.past ? '#6e5f4b' : row.live ? amber.jewel : brass.bright;
    const titleColor = row.past ? brass.mid : row.live ? amber.jewel : brass.etch;
    const yearColor = row.past ? '#5c4f3d' : brass.mid;
    const noteColor = row.past ? '#6e5f4b' : row.live ? '#cbba99' : brass.muted;
    const rowBg: [string, string] = row.live ? ['#3d2a12', '#1e1206'] : ['#2e2013', '#171006'];
    const jewelStyle = row.live
      ? { backgroundColor: amber.jewel, shadowColor: amber.glow, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }
      : { backgroundColor: 'rgba(241,229,207,0.14)' };

    if (landscape) {
      return (
        <Pressable key={r} style={[styles.rowL, { opacity: row.past ? 0.55 : 1 }]} onPress={onTune} onLongPress={() => row.prog && onNotes(row.prog)}>
          <LinearGradient colors={['#38271a', '#1a1006']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.timeBox}>
            <View style={styles.cellRun}>
              {timeChars.map((c, j) => <Cell key={j} ch={c} w={9} h={15} fs={11} color={timeColor} />)}
            </View>
          </LinearGradient>
          <LinearGradient colors={rowBg} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.mainBoxL}>
            {row.live
              ? <FilamentLamp style={[styles.jewel, jewelStyle]} amplitude={0.028} />
              : <View style={[styles.jewel, jewelStyle]} />}
            <View style={styles.cellRun}>
              {titleChars.map((c, j) => <Cell key={j} ch={c} w={10} h={17} fs={12} color={titleColor} />)}
            </View>
            <View style={styles.cellRun}>
              {yearChars.map((c, j) => <Cell key={j} ch={c} w={8} h={15} fs={10} color={yearColor} />)}
            </View>
            <Text style={[styles.note, { color: noteColor }]} numberOfLines={1}>{row.note}</Text>
            <Text style={styles.status}>{row.live ? 'ON THE AIR' : row.next ? 'NEXT' : ''}</Text>
          </LinearGradient>
        </Pressable>
      );
    }

    return (
      <Pressable key={r} onPress={onTune} onLongPress={() => row.prog && onNotes(row.prog)} style={{ flex: 1 }}>
        <LinearGradient colors={rowBg} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[styles.rowP, { opacity: row.past ? 0.55 : 1 }]}>
          <View style={styles.rowPLine}>
            {row.live
              ? <FilamentLamp style={[styles.jewel, jewelStyle]} amplitude={0.028} />
              : <View style={[styles.jewel, jewelStyle]} />}
            <View style={styles.cellRun}>
              {timeChars.map((c, j) => <Cell key={j} ch={c} w={8} h={14} fs={10.5} color={timeColor} />)}
            </View>
            <Text style={[styles.noteP, { color: noteColor }]} numberOfLines={1}>{row.note}</Text>
          </View>
          <View style={styles.rowPLine}>
            <View style={styles.cellRun}>
              {titleChars.map((c, j) => <Cell key={j} ch={c} w={10.5} h={18} fs={13} color={titleColor} />)}
            </View>
            <View style={[styles.cellRun, { marginLeft: 'auto' }]}>
              {yearChars.map((c, j) => <Cell key={j} ch={c} w={8} h={14} fs={10} color={yearColor} />)}
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    );
  });

  if (landscape) {
    return (
      <View style={styles.boardL}>
        <View style={styles.headerL}>
          <Text style={styles.titleL}>THIS EVENING</Text>
          {channel && (
            <LinearGradient colors={['#f2bd6b', '#d99b3f']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.headPlate}>
              <Text style={styles.headPlateText}>CHANNEL {channel.number} · {channel.name.toUpperCase()}</Text>
            </LinearGradient>
          )}
          <View style={styles.onAir}>
            <FilamentLamp
              amplitude={0.028}
              style={[styles.jewel, { backgroundColor: amber.jewel, shadowColor: amber.glow, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }]}
            />
            <Text style={styles.onAirText}>ON THE AIR — {clock12(clockNow)}</Text>
          </View>
        </View>
        {tabs}
        <View style={styles.rowsWrap}>{rows}</View>
        <View style={styles.footerL}>
          <Text style={styles.footHint}>TAP A ROW TO TUNE</Text>
          <Text style={styles.footHint}>·</Text>
          <Text style={styles.footHint}>HOLD FOR NOTES</Text>
          <Text style={styles.footHint}>·</Text>
          <Pressable onPress={rollHome}><Text style={[styles.footHint, { color: brass.mid }]}>RETURN</Text></Pressable>
        </View>
      </View>
    );
  }

  // Portrait: the shade, over whatever the room was showing.
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.shade, { top, height, transform: [{ translateY: shadeY }] }]}>
        <View style={styles.headerP}>
          <Text style={styles.titleP}>THIS EVENING</Text>
          <Text style={styles.clockP}>{clock12(clockNow)}</Text>
        </View>
        {tabs}
        <View style={styles.rowsWrap}>{rows}</View>
        {/* the roller bar and its ring pull */}
        <Pressable onPress={rollHome} style={styles.roller}>
          <View style={styles.ring} />
        </Pressable>
      </Animated.View>
      <Pressable style={styles.latchPlateWrap} onPress={rollHome}>
        <View style={styles.latchPlate}>
          <Text style={styles.latchText}>TAP THE RING — AND IT ROLLS HOME</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  boardL: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#170e07',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerL: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  titleL: {
    fontFamily: fonts.plate,
    fontWeight: '600',
    fontSize: 20,
    letterSpacing: 1.2,
    color: cream,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 2 },
  },
  headPlate: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
    paddingVertical: 3,
    paddingHorizontal: 12,
    shadowColor: amber.jewel,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  headPlateText: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 8,
    letterSpacing: 1.6,
    color: '#2a1a08',
  },
  onAir: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  onAirText: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 2,
    color: brass.mid,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  // Drawn triangles, not typeset ones — Besley has no U+25C0/25B6, so iOS
  // substitutes a system glyph that breaks the printed-legend aesthetic.
  tabArrowChip: {
    borderRadius: 2,
    borderWidth: 1,
    borderColor: walnut.void,
    backgroundColor: walnut.grain,
    paddingVertical: 8,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabArrowTri: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  tabArrowTriLeft: {
    borderRightWidth: 7,
    borderRightColor: brass.mid,
  },
  tabArrowTriRight: {
    borderLeftWidth: 7,
    borderLeftColor: brass.mid,
  },
  tab: {
    borderRadius: 2,
    borderWidth: 1,
    borderColor: walnut.void,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  tabActive: {
    shadowColor: amber.jewel,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  tabText: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 7.5,
    letterSpacing: 1,
  },
  tabHint: {
    marginLeft: 'auto',
    fontFamily: fonts.plate,
    fontSize: 7,
    letterSpacing: 1.6,
    color: '#6e5f4b',
  },
  rowsWrap: {
    flex: 1,
    gap: 5,
    marginTop: 9,
  },
  rowL: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 5,
  },
  timeBox: {
    width: 56,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
  },
  mainBoxL: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
    overflow: 'hidden',
  },
  jewel: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  cellRun: {
    flexDirection: 'row',
    flexShrink: 0,
  },
  note: {
    flex: 1,
    fontFamily: fonts.speech,
    fontSize: 10.5,
    minWidth: 0,
  },
  status: {
    fontFamily: fonts.plate,
    fontSize: 6.5,
    letterSpacing: 1.6,
    color: amber.needle,
    flexShrink: 0,
  },
  footerL: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 7,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.8)',
  },
  footHint: {
    fontFamily: fonts.plate,
    fontSize: 6.5,
    letterSpacing: 1.8,
    color: '#6e5f4b',
  },

  // ── portrait shade ──
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#170e07',
    paddingHorizontal: 16,
    paddingTop: 18,
    shadowColor: '#000',
    shadowOpacity: 0.75,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 16 },
    elevation: 20,
  },
  headerP: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleP: {
    fontFamily: fonts.plate,
    fontWeight: '600',
    fontSize: 19,
    letterSpacing: 1.1,
    color: cream,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 2 },
  },
  clockP: {
    marginLeft: 'auto',
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 1.8,
    color: brass.mid,
  },
  rowP: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
    overflow: 'hidden',
  },
  rowPLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  noteP: {
    flex: 1,
    fontFamily: fonts.speech,
    fontSize: 10.5,
    textAlign: 'right',
    minWidth: 0,
  },
  roller: {
    height: 26,
    marginTop: 12,
    marginHorizontal: -16,
    backgroundColor: '#43321a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,229,207,0.18)',
    borderBottomWidth: 1,
    borderBottomColor: walnut.void,
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    bottom: -24,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 5,
    borderColor: '#b08d52',
    borderTopColor: '#d9bb84',
    borderBottomColor: '#7a5f34',
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  latchPlateWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
  },
  latchPlate: {
    backgroundColor: walnut.grain,
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  latchText: {
    fontFamily: fonts.plate,
    fontSize: 7,
    letterSpacing: 1.9,
    color: brass.muted,
  },
});
