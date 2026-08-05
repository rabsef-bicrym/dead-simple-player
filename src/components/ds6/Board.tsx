import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, amber, cream, fonts } from '../../constants/ds6';
import { Plate } from './Plate';
import { STEP, flapChars, drumNeed, Cell } from './flap';
import { playSound } from '../../utils/sound';
import { dateProse } from '../../utils/prose';
import { conjoinEvening, boardTitle } from '../../services/evening';
import type { Channel, Programme } from '../../types';

/**
 * This Evening — the departure board.
 *
 * De-muxed, one channel at a time; a true drum-order split-flap. Every
 * module rolls forward through its drum — blank, A to Z, 0 to 9,
 * punctuation — and stops only when its card comes round. Cells already
 * showing the right character never move; far letters rattle longest.
 * That drum-distance difference IS the cascade. Two past airings ride
 * dimmed above the live row, which wears the jewel; the future is cream.
 * The board rests except on events: it advances itself when the hour
 * does, and cascades when the channel changes.
 */

const ROWS = 8;

const LEN = { time: 5, title: 34, year: 4, note: 56 };

interface BoardRow {
  time: string;
  title: string;
  year: string;
  note: string;
  live: boolean;
  past: boolean;
  next: boolean;
  prog?: Programme;
}

const BLANK_ROW: BoardRow = { time: '', title: '', year: '', note: '', live: false, past: false, next: false };

function maxDrumNeed(prev: BoardRow[], cur: BoardRow[]): number {
  let max = 0;
  const fields: (keyof typeof LEN)[] = ['time', 'title', 'year', 'note'];
  for (let r = 0; r < prev.length; r++) {
    for (const f of fields) {
      const padLeft = f === 'time' || f === 'year';
      max = Math.max(max, drumNeed(prev[r][f], cur[r][f], LEN[f], padLeft));
    }
  }
  return max;
}

function clockShort(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function rowsFor(progs: Programme[], liveIdx: number, scroll: number): BoardRow[] {
  const start = (liveIdx < 0 ? 0 : liveIdx - 2) + scroll;
  return Array.from({ length: ROWS }, (_, k) => {
    const idx = start + k;
    const p = idx >= 0 ? progs[idx] : undefined;
    if (!p) return BLANK_ROW;
    return {
      time: clockShort(p.start),
      title: boardTitle(p),
      year: p.year ?? '',
      note: p.description ?? '',
      live: idx === liveIdx,
      past: liveIdx >= 0 && idx < liveIdx,
      next: idx === liveIdx + 1,
      prog: p,
    };
  });
}

function rowsKey(rows: BoardRow[]): string {
  return rows.map((r) => `${r.time}|${r.title}|${r.year}|${r.note}`).join('~');
}

interface BoardProps {
  channels: Channel[];
  boardIndex: number;
  onSelectChannel: (index: number) => void;
  programmes: Programme[];
  scroll: number;
  /** Which of the eight rows carries the reading cursor. */
  cursor: number;
  /** The receiver reads the cursor's programme from here when N is pressed. */
  cursorProgRef: MutableRefObject<Programme | null>;
  onNotes: (p: Programme) => void;
  /** Tune to the board's channel — the ⏎ plate in the footer, tapped. */
  onTune?: () => void;
  /** Fold the board away — the G plate in the footer, tapped. */
  onClose?: () => void;
  clockNow: Date;
}

export function Board({ channels, boardIndex, onSelectChannel, programmes, scroll, cursor, cursorProgRef, onNotes, onTune, onClose, clockNow }: BoardProps) {
  const { width, height } = useWindowDimensions();

  const channel = channels[boardIndex];
  // Interstitial glue removed, same-AIRING repeats conjoined — identity is
  // title+episode, not title alone (see conjoinEvening for the MST3K case).
  const progs = conjoinEvening(programmes, channel?.id);
  const liveIdx = progs.findIndex((p) => p.start.getTime() <= clockNow.getTime() && p.stop.getTime() > clockNow.getTime());
  const target = rowsFor(progs, liveIdx, scroll);
  const targetKey = rowsKey(target);

  // The drum machinery: prev holds what the board showed, cur what it is
  // rolling toward, ticks how many flips have happened.
  const prevRef = useRef<BoardRow[]>(target);
  const curRef = useRef<BoardRow[]>(target);
  const keyRef = useRef(targetKey);
  const causeRef = useRef({ boardIndex, scroll });
  const needRef = useRef(0);
  const [ticks, setTicks] = useState(Number.MAX_SAFE_INTEGER);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Paging through the evening repositions the window plainly — and it
  // must happen DURING render, not in an effect: an effect that only
  // touches refs never re-paints, and the new row would wait for the
  // next unrelated render to appear.
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
      // The full cascade — saved for channel changes and the hour.
      prevRef.current = curRef.current;
      curRef.current = target;
      needRef.current = maxDrumNeed(prevRef.current, target);
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
  }, [targetKey, boardIndex, scroll, target]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const moving = ticks < needRef.current;
  const prev = prevRef.current;
  const cur = curRef.current;

  // Keep the receiver's view of the cursor row current — target rows,
  // not whatever the drums happen to be showing mid-cascade.
  cursorProgRef.current = target[cursor]?.prog ?? null;

  const short = height < 700;
  const rowH = short ? 36 : 46;
  const meridiem = clockNow.getHours() < 12 ? 'A.M.' : 'P.M.';

  return (
    <View style={styles.board}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="boardLight" cx="50%" cy="0%" rx="100%" ry="130%">
            <Stop offset="0%" stopColor="#20150c" />
            <Stop offset="60%" stopColor="#170e07" />
            <Stop offset="100%" stopColor="#110a04" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#boardLight)" />
      </Svg>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>THIS EVENING</Text>
        <Text style={styles.date}>{dateProse(clockNow)}</Text>
        <View style={styles.headerRight}>
          <Plate jewel label={`ON THE AIR — ${clockShort(clockNow)} ${meridiem}`} labelSize={10} />
        </View>
      </View>

      {/* Channel tabs */}
      <View style={styles.tabs}>
        <Pressable onPress={() => onSelectChannel((boardIndex - 1 + channels.length) % channels.length)} hitSlop={10}>
          <Text style={styles.tabArrow}>◀</Text>
        </Pressable>
        {channels.map((ch, i) => {
          const active = i === boardIndex;
          return (
            <Pressable key={ch.id} onPress={() => onSelectChannel(i)}>
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
        <Pressable onPress={() => onSelectChannel((boardIndex + 1) % channels.length)} hitSlop={10}>
          <Text style={styles.tabArrow}>▶</Text>
        </Pressable>
        <Text style={styles.tabHint}>◀ ▶ CHANGES THE CHANNEL</Text>
      </View>

      {/* The rows */}
      <View style={styles.rows}>
        {cur.map((row, r) => {
          const pRow = prev[r];
          const timeChars = flapChars(pRow.time, row.time, LEN.time, ticks, true);
          const titleChars = flapChars(pRow.title, row.title, LEN.title, ticks, false);
          const yearChars = flapChars(pRow.year, row.year, LEN.year, ticks, true);
          const noteChars = flapChars(pRow.note, row.note, LEN.note, ticks, false);
          const timeColor = row.past ? '#6e5f4b' : row.live ? amber.jewel : brass.bright;
          const titleColor = row.past ? brass.mid : row.live ? amber.jewel : brass.etch;
          const yearColor = row.past ? '#5c4f3d' : brass.mid;
          const noteColor = row.past ? '#6e5f4b' : row.live ? '#cbba99' : brass.muted;
          const jiggle = moving ? (ticks % 2 ? '-2deg' : '1.4deg') : '0deg';
          return (
            <Pressable
              key={r}
              onPress={() => row.prog && onNotes(row.prog)}
              style={[
                styles.row,
                { height: rowH, opacity: row.past ? 0.5 : 1 },
                r === cursor && styles.rowCursor,
                { transform: [{ perspective: 800 }, { rotateX: jiggle }] } as never,
              ]}
            >
              <LinearGradient colors={['#38271a', '#1a1006']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.timeBox}>
                <View style={styles.cellRun}>
                  {timeChars.map((c, j) => (
                    <Cell key={j} ch={c} w={11} h={18} fs={14} color={timeColor} />
                  ))}
                </View>
              </LinearGradient>
              <LinearGradient
                colors={row.live ? ['#3d2a12', '#1e1206'] : ['#2e2013', '#171006']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.mainBox}
              >
                <View
                  style={[
                    styles.jewel,
                    row.live
                      ? { backgroundColor: amber.jewel, shadowColor: amber.glow, shadowOpacity: 0.9, shadowRadius: 10 }
                      : { backgroundColor: 'rgba(241,229,207,0.14)' },
                  ]}
                />
                <View style={styles.cellRun}>
                  {titleChars.map((c, j) => (
                    <Cell key={j} ch={c} w={12} h={20} fs={15} color={titleColor} />
                  ))}
                </View>
                <View style={styles.cellRun}>
                  {yearChars.map((c, j) => (
                    <Cell key={j} ch={c} w={10.5} h={18} fs={12} color={yearColor} />
                  ))}
                </View>
                <View style={[styles.cellRun, styles.noteRun]}>
                  {noteChars.map((c, j) => (
                    <Cell key={j} ch={c} w={8} h={16} fs={11} color={noteColor} hingeDim />
                  ))}
                </View>
                <Text style={[styles.status, { color: row.live ? amber.jewel : '#6e5f4b' }]}>
                  {row.live ? 'ON THE AIR' : row.next ? 'NEXT' : ''}
                </Text>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.hint}>
          <Plate label="↕" compact labelSize={10} />
          <Text style={styles.hintText}>THROUGH THE EVENING</Text>
        </View>
        <Pressable style={styles.hint} onPress={onTune}>
          <Plate label="⏎" compact labelSize={10} />
          <Text style={styles.hintText}>TUNE</Text>
        </Pressable>
        <View style={styles.hint}>
          <Plate label="N" compact labelSize={10} />
          <Text style={styles.hintText}>NOTES</Text>
        </View>
        <Pressable style={styles.hint} onPress={onClose}>
          <Plate label="G" compact labelSize={10} />
          <Text style={styles.hintText}>RETURN</Text>
        </Pressable>
        <Text style={styles.footNote}>the board advances itself when the hour does</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: walnut.void,
    paddingHorizontal: 56,
    paddingTop: 30,
    paddingBottom: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  title: {
    fontFamily: fonts.plate,
    fontWeight: '600',
    fontSize: 36,
    letterSpacing: 2.2,
    color: cream,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 2 },
  },
  date: {
    fontFamily: fonts.speech,
    fontSize: 15,
    color: brass.muted,
    marginTop: 5,
  },
  headerRight: {
    marginLeft: 'auto',
    flexDirection: 'row',
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  tabArrow: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 2.3,
    color: '#6e5f4b',
    marginHorizontal: 6,
  },
  tab: {
    borderRadius: 2,
    borderWidth: 1,
    borderColor: walnut.void,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  tabActive: {
    shadowColor: amber.jewel,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  tabText: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 1.4,
  },
  tabHint: {
    marginLeft: 'auto',
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 2.2,
    color: '#6e5f4b',
  },
  rows: {
    flex: 1,
    marginTop: 16,
    gap: 8,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    borderRadius: 4,
  },
  // The reading cursor — a brass hairline around the row under study.
  rowCursor: {
    borderWidth: 1,
    borderColor: 'rgba(201,180,140,0.5)',
    marginHorizontal: -5,
    paddingHorizontal: 4,
    shadowColor: amber.jewel,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  timeBox: {
    width: 78,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
  },
  mainBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
    overflow: 'hidden',
  },
  jewel: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  cellRun: {
    flexDirection: 'row',
    flexShrink: 0,
  },
  noteRun: {
    flex: 1,
    flexShrink: 1,
    overflow: 'hidden',
  },
  status: {
    fontFamily: fonts.plate,
    fontSize: 8.5,
    letterSpacing: 2.2,
    color: '#6e5f4b',
    flexShrink: 0,
    minWidth: 78,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 34,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.8)',
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hintText: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 2.4,
    color: brass.mid,
  },
  footNote: {
    fontFamily: fonts.speech,
    fontSize: 12,
    color: '#6e5f4b',
  },
});
