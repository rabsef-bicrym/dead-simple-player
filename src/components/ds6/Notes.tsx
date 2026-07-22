import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, useWindowDimensions } from 'react-native';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, amber, cream, fonts } from '../../constants/ds6';
import { durationProse, timeToProse } from '../../utils/prose';
import type { Channel, Programme } from '../../types';

/**
 * Programme notes — the NFO, projected on the dimmed picture (7d).
 *
 * The picture dims but does not stop; the notes hang in front of it
 * like a slide from the projection booth. A stamped header plate, the
 * title spoken large, the provenance line in tracked Besley, a brass
 * rule with an amber diamond, and then the essay: the lede in cream,
 * the rest a shade quieter. The bottom rail keeps faith with the
 * broadcast — what continues beneath, and when it ends.
 */

interface NotesProps {
  programme: Programme;
  channel?: Channel;
  clockNow: Date;
  onClose: () => void;
}

function BrassRule() {
  return (
    <View style={styles.ruleRow}>
      <View style={styles.ruleLine} />
      <View style={styles.ruleDiamond} />
      <View style={styles.ruleLine} />
    </View>
  );
}

function metaLine(p: Programme): string {
  const bits: string[] = [];
  if (p.year) bits.push(p.year);
  bits.push(durationProse(p.start, p.stop));
  if (p.subtitle) bits.push(p.subtitle);
  else if (p.episodeNum) bits.push(p.episodeNum);
  if (p.previouslyShown) bits.push('an encore presentation');
  return bits.join(' · ').toUpperCase();
}

function clockShort(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function Notes({ programme, channel, clockNow, onClose }: NotesProps) {
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);

  // ↓ READ ON, as the hint says — the arrows page the projection.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const step = e.key === 'ArrowDown' ? 160 : e.key === 'ArrowUp' ? -160 : 0;
      if (!step) return;
      offsetRef.current = Math.max(0, offsetRef.current + step);
      scrollRef.current?.scrollTo({ y: offsetRef.current, animated: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const paragraphs = (programme.description ?? '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const now = clockNow.getTime();
  const airing = programme.start.getTime() <= now && programme.stop.getTime() > now;
  const future = programme.start.getTime() > now;
  const progress = airing
    ? Math.min(1, Math.max(0, (now - programme.start.getTime()) / (programme.stop.getTime() - programme.start.getTime())))
    : 0;
  const meridiem = clockNow.getHours() < 12 ? 'A.M.' : 'P.M.';

  const railText = airing
    ? `the picture continues beneath · ends at ${clockShort(programme.stop)}`
    : future
      ? `airs at ${timeToProse(programme.start)}`
      : 'previously aired';

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* the dimming — the projectionist lowers the house lights */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="notesDim" cx="50%" cy="46%" rx="75%" ry="90%">
            <Stop offset="0%" stopColor="#0e0803" stopOpacity={0.72} />
            <Stop offset="78%" stopColor="#0e0803" stopOpacity={0.95} />
            <Stop offset="100%" stopColor="#0e0803" stopOpacity={0.97} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#notesDim)" />
      </Svg>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          offsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
      >
        <View style={styles.column} pointerEvents="box-none">
          {/* Header plate */}
          <View style={styles.headerPlateShell}>
            <LinearGradient colors={[walnut.grain, '#231507']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.headerPlate}>
              <View style={styles.jewel} />
              <Text style={styles.headerText}>
                {`PROGRAMME NOTES${channel ? ` — CHANNEL ${channel.number}` : ''}`}
              </Text>
            </LinearGradient>
          </View>

          <Text style={styles.title}>{programme.title}</Text>
          <Text style={styles.meta}>{metaLine(programme)}</Text>
          <BrassRule />

          {paragraphs.length > 0 ? (
            paragraphs.map((para, i) => (
              <Text key={i} style={i === 0 ? styles.lede : styles.body}>
                {para}
              </Text>
            ))
          ) : (
            <Text style={styles.body}>The library offers no notes for this programme.</Text>
          )}

          <Text style={styles.hint}>↕ READ ON · N RETURNS TO THE PICTURE</Text>
        </View>
      </ScrollView>

      {/* Bottom rail — faith with the broadcast */}
      <View style={styles.rail} pointerEvents="none">
        <Text style={styles.railText}>{railText}</Text>
        <View style={styles.railTrack}>
          {airing && <View style={[styles.railFill, { width: `${progress * 100}%` }]} />}
        </View>
        <Text style={styles.railClock}>{`${clockShort(clockNow)} ${meridiem}`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 46,
    paddingBottom: 80,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: 700,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerPlateShell: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
  },
  headerPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 2,
    paddingVertical: 7,
    paddingHorizontal: 26,
  },
  jewel: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: amber.jewel,
    shadowColor: amber.glow,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  headerText: {
    fontFamily: fonts.plate,
    fontSize: 10,
    letterSpacing: 3.2,
    color: brass.bright,
  },
  title: {
    fontFamily: fonts.plate,
    fontWeight: '600',
    fontSize: 54,
    lineHeight: 64,
    paddingBottom: 6,
    color: cream,
    marginTop: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 2 },
  },
  meta: {
    fontFamily: fonts.plate,
    fontSize: 11.5,
    letterSpacing: 3,
    color: brass.muted,
    marginTop: 12,
    textAlign: 'center',
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 20,
  },
  ruleLine: {
    width: 150,
    height: 1,
    backgroundColor: 'rgba(241,229,207,0.28)',
  },
  ruleDiamond: {
    width: 5,
    height: 5,
    backgroundColor: amber.needle,
    transform: [{ rotate: '45deg' }],
  },
  lede: {
    fontFamily: fonts.speech,
    fontSize: 17,
    lineHeight: 30,
    color: cream,
    marginTop: 22,
    maxWidth: 660,
  },
  body: {
    fontFamily: fonts.speech,
    fontSize: 15.5,
    lineHeight: 26,
    color: '#cbba99',
    marginTop: 14,
    maxWidth: 660,
  },
  hint: {
    fontFamily: fonts.plate,
    fontSize: 9.5,
    letterSpacing: 3,
    color: '#6e5f4b',
    marginTop: 26,
  },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  railText: {
    fontFamily: fonts.speech,
    fontSize: 13.5,
    color: brass.muted,
  },
  railTrack: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(241,229,207,0.15)',
  },
  railFill: {
    height: 1,
    backgroundColor: amber.needle,
    shadowColor: amber.needle,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  railClock: {
    fontFamily: fonts.plate,
    fontSize: 12,
    letterSpacing: 2,
    color: '#6e5f4b',
    fontVariant: ['tabular-nums'],
  },
});
