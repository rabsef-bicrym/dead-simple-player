import { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, Pressable, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Line, Rect, RadialGradient, Stop } from 'react-native-svg';
import { walnut, brass, amber, cream, fonts, plateTracking } from '../../constants/ds6';
import { Plate } from './Plate';
import { FlipClock } from './FlipClock';
import { Dial } from './Dial';
import { greeting, timeToProse, countWord } from '../../utils/prose';
import type { Channel, Programme } from '../../types';

/**
 * Home — the receiver, cabinet face on, per the faceplate drawing.
 *
 * The wordmark stamped top-left with the one chrome signature beside it;
 * the announcer's greeting top-right. The dial sits left of amidships and
 * the right-hand panel answers it: NOW ON THE AIR, the channel's art
 * plate, the programme spoken large, its provenance line, the blurb, and
 * what comes after. The service rail runs along the bottom.
 */

interface HomeProps {
  channels: Channel[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onTune: (index: number) => void;
  /** Open This Evening — the G plate on the rail, tapped. */
  onBoard?: () => void;
  /** Back to the picture — the power jewel, tapped. */
  onPower?: () => void;
  /** Open the service panel — the S plate on the rail, tapped. */
  onService?: () => void;
  /** Project the notes for a programme — the panel, tapped. */
  onNotes?: (programme: Programme) => void;
  nowPlayingMap: Map<string, Programme>;
  upNextMap: Map<string, Programme>;
  clockNow: Date;
}

function clockShort(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The framed art plate — programme art when the guide offers it, a woven blank when it doesn't. */
function ArtFrame({ channel, art }: { channel: Channel; art?: string }) {
  const stripes: number[] = [];
  for (let k = -118; k <= 250; k += 28) stripes.push(k);
  return (
    <View style={styles.artFrame}>
      {art ? (
        <Image source={{ uri: art }} style={styles.artImage} resizeMode="contain" />
      ) : (
        <>
          <Svg width={250} height={118} style={StyleSheet.absoluteFill}>
            {stripes.map((k) => (
              <Line key={k} x1={k} y1={0} x2={k + 118} y2={118} stroke="#251a10" strokeWidth={14} />
            ))}
          </Svg>
          <Text style={styles.artBlank}>{channel.name.toUpperCase()}</Text>
        </>
      )}
    </View>
  );
}

export function Home({ channels, selectedIndex, onSelect, onTune, onBoard, onPower, onService, onNotes, nowPlayingMap, upNextMap, clockNow }: HomeProps) {
  const { width, height } = useWindowDimensions();
  const panelOpacity = useRef(new Animated.Value(1)).current;

  const selected = channels[selectedIndex];
  const now = selected ? nowPlayingMap.get(selected.id) : undefined;
  const next = selected ? upNextMap.get(selected.id) : undefined;

  // ErsatzTV's auto-generated text logos (/logos/gen) are not art; the
  // woven blank plate wears the cabinet better than their black card.
  const channelLogo = selected?.logo && !selected.logo.includes('/logos/gen') ? selected.logo : undefined;
  const art = now?.icon ?? channelLogo;

  // The panel takes a breath while the dial winds, then settles.
  useEffect(() => {
    panelOpacity.setValue(0.25);
    Animated.timing(panelOpacity, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [selectedIndex, panelOpacity]);

  // The station plates ride outside the dial drawing; the wrapper below
  // reserves their extent (190 wide, 90 tall) so they never trespass on
  // the masthead or the panel.
  const dialSize = Math.max(280, Math.min(620, height - 262, width * 0.55 - 190));

  // On a short cabinet the panel's engraving shrinks so nothing spills
  // into the masthead; the television gets the full drawing.
  const short = height < 700;

  const meta = now
    ? [`${clockShort(now.start)} TO ${clockShort(now.stop)}`, now.subtitle?.toUpperCase()].filter(Boolean).join(' · ')
    : null;

  return (
    <View style={styles.cabinet}>
      {/* the cabinet's light falls from up-left, as drawn */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="cabinetLight" cx="30%" cy="40%" rx="90%" ry="120%">
            <Stop offset="0%" stopColor="#241810" />
            <Stop offset="55%" stopColor="#190f08" />
            <Stop offset="100%" stopColor="#120a05" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#cabinetLight)" />
      </Svg>

      {/* Masthead */}
      <View style={styles.masthead}>
        <View style={styles.mark}>
          <Plate label="D S , P" labelSize={16} />
          <Text style={styles.signature}>dead simple, player</Text>
        </View>
        <Text style={styles.greeting}>{greeting(clockNow)}</Text>
      </View>

      {/* Amidships: the dial left, the panel answering it */}
      <View style={styles.midRow}>
        <View
          style={{
            width: dialSize + 190,
            height: dialSize + 90,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Dial
            channels={channels}
            selectedIndex={selectedIndex}
            onSelect={onSelect}
            onTune={onTune}
            size={dialSize}
          />
        </View>

        <Animated.View style={[styles.panel, { opacity: panelOpacity }]}>
          {selected && (
            <Pressable onPress={() => now && onNotes?.(now)}>
              <View style={styles.panelHeader}>
                <Plate jewel label={`NOW ON THE AIR — CHANNEL ${selected.number}`} labelSize={11} />
              </View>
              <ArtFrame channel={selected} art={art} />
              <Text
                style={[styles.panelTitle, short && { fontSize: 34, lineHeight: 44 }]}
                numberOfLines={2}
              >
                {now?.title ?? selected.name}
              </Text>
              {meta && (
                <Text style={styles.panelMeta} numberOfLines={1}>
                  {meta}
                </Text>
              )}
              {now?.description ? (
                <Text style={styles.panelBlurb} numberOfLines={short ? 2 : 4}>
                  {now.description}
                </Text>
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

      {/* Service rail */}
      <View style={styles.rail}>
        <Plate
          label={`MODEL DS-${channels.length} · ${countWord(channels.length)}-CHANNEL RECEIVER`}
          compact
          labelSize={9}
        />
        <View style={styles.hints}>
          <View style={styles.hint}>
            <Plate label="◀ ▶" compact labelSize={10} />
            <Text style={styles.hintText}>TUNE</Text>
          </View>
          <Pressable style={styles.hint} onPress={() => onTune(selectedIndex)}>
            <Plate label="⏎" compact labelSize={10} />
            <Text style={styles.hintText}>WATCH</Text>
          </Pressable>
          <Pressable style={styles.hint} onPress={onBoard}>
            <Plate label="G" compact labelSize={10} />
            <Text style={styles.hintText}>THIS EVENING</Text>
          </Pressable>
          <Pressable style={styles.hint} onPress={onService}>
            <Plate label="S" compact labelSize={10} />
            <Text style={styles.hintText}>SERVICE</Text>
          </Pressable>
        </View>
        <View style={styles.clockSide}>
          <Pressable style={styles.power} onPress={onPower}>
            <View style={styles.jewel} />
            <Text style={styles.hintText}>POWER</Text>
          </Pressable>
          <FlipClock date={clockNow} />
        </View>
      </View>
    </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    paddingTop: 26,
    zIndex: 2,
  },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  signature: {
    fontFamily: fonts.signature,
    fontSize: 26,
    color: amber.needle,
    transform: [{ rotate: '-2deg' }],
    marginTop: 2,
    textShadowColor: 'rgba(223,161,79,0.35)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  greeting: {
    fontFamily: fonts.speech,
    fontSize: 16,
    color: brass.muted,
  },
  midRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 48,
    gap: 36,
  },
  panel: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingBottom: 14,
  },
  panelHeader: {
    flexDirection: 'row',
  },
  artFrame: {
    width: 250,
    height: 118,
    marginTop: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: walnut.void,
    backgroundColor: '#1e140b',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artImage: {
    width: 250,
    height: 118,
  },
  artBlank: {
    fontFamily: fonts.plate,
    fontSize: 10,
    letterSpacing: 3,
    color: '#6e5f4b',
  },
  panelTitle: {
    fontFamily: fonts.plate,
    fontWeight: '600',
    fontSize: 48,
    // Besley's descenders reach below the last line box, and the clamp
    // clips at the padding edge — so the padding is where they live.
    lineHeight: 62,
    paddingBottom: 12,
    color: cream,
    marginTop: 16,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 2 },
  },
  panelMeta: {
    fontFamily: fonts.plate,
    fontSize: 12.5,
    letterSpacing: plateTracking(12.5) * 1.4,
    color: brass.muted,
    marginTop: 10,
  },
  panelBlurb: {
    fontFamily: fonts.speech,
    fontSize: 16.5,
    lineHeight: 27,
    color: '#cbba99',
    marginTop: 16,
    maxWidth: 460,
  },
  panelThen: {
    fontFamily: fonts.speech,
    fontSize: 14.5,
    color: brass.muted,
    marginTop: 12,
  },
  panelThenTitle: {
    fontWeight: '600',
    color: cream,
  },
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 36,
    paddingHorizontal: 44,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.8)',
    backgroundColor: 'rgba(13,7,2,0.55)',
    zIndex: 2,
  },
  hints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
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
  clockSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginLeft: 'auto',
  },
  power: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  jewel: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: amber.jewel,
    shadowColor: amber.glow,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
