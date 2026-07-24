import { View, Text, StyleSheet } from 'react-native';
import { fonts } from '../../constants/ds6';

/**
 * The split-flap toolkit — shared by the console board (DS-8) and the
 * traveling set's board (DS-8/M). One drum, one step cadence, one cell
 * drawing, so both cabinets rattle the same way.
 */

// The ½ earned its place on the drum the day Fellini's 8½ hit the
// Nana's Picks rotation.
export const DRUM = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789½:.,-&;'";
export const DN = DRUM.length;
export const STEP = 55;

export function di(ch: string): number {
  const x = DRUM.indexOf(ch);
  return x < 0 ? 0 : x;
}

export function fmt(txt: string, len: number, padLeft: boolean): string {
  let str = (txt || '').toUpperCase();
  if (str.length > len) str = str.slice(0, len);
  const pad = ' '.repeat(len - str.length);
  return padLeft ? pad + str : str + pad;
}

/** The character each module shows after `done` flips from prev toward cur. */
export function flapChars(prevTxt: string, curTxt: string, len: number, done: number, padLeft: boolean): string[] {
  const P = fmt(prevTxt, len, padLeft);
  const C = fmt(curTxt, len, padLeft);
  const out: string[] = [];
  for (let j = 0; j < len; j++) {
    const a = di(P[j]);
    const need = (di(C[j]) - a + DN) % DN;
    out.push(DRUM[(a + Math.min(need, done)) % DN]);
  }
  return out;
}

/** Longest drum distance between two strings of the same field. */
export function drumNeed(prevTxt: string, curTxt: string, len: number, padLeft: boolean): number {
  const P = fmt(prevTxt, len, padLeft);
  const C = fmt(curTxt, len, padLeft);
  let max = 0;
  for (let j = 0; j < P.length; j++) {
    const need = (di(C[j]) - di(P[j]) + DN) % DN;
    if (need > max) max = need;
  }
  return max;
}

/** One split-flap module: a dark tile, its hinge, its character. */
export function Cell({ ch, w, h, fs, color, hingeDim }: { ch: string; w: number; h: number; fs: number; color: string; hingeDim?: boolean }) {
  return (
    <View style={[styles.cell, { width: w, height: h }]}>
      <Text style={{ fontFamily: fonts.flapBold, fontSize: fs, lineHeight: h, color, textAlign: 'center' }}>
        {ch === ' ' ? '' : ch}
      </Text>
      <View style={[styles.hinge, { top: h / 2, opacity: hingeDim ? 0.5 : 1 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 1.5,
    marginRight: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hinge: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
});
