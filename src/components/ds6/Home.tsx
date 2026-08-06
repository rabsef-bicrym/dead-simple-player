import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated, Pressable, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Line, Rect, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
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
 * the announcer's greeting top-right. Amidships, a station register stands
 * left, the dial occupies the remaining centerline, and the right-hand
 * panel answers it: NOW ON THE AIR, the channel's art plate, the programme
 * spoken large, its provenance line, the blurb, and what comes after. The
 * service rail runs along the bottom.
 */

interface HomeProps {
  channels: Channel[];
  selectedIndex: number;
  /** The channel actually on the air — its plate carries the pilot lamp. */
  tunedIndex: number;
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

const REGISTER_MIN_PLATE_HEIGHT = 42;
const REGISTER_MAX_PLATE_HEIGHT = 56;
const REGISTER_PLATE_GAP = 6;
const REGISTER_HEADER_HEIGHT = 30;
const REGISTER_INDICATOR_HEIGHT = 14;

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

function StationRegisterPlate({
  channel,
  height,
  tuned,
  selected,
  onPress,
}: {
  channel: Channel;
  height: number;
  tuned: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  // The golden face is the dial's cursor and moves with it; the station on
  // the air keeps a pilot lamp lit whether or not the cursor is resting there.
  const face: [string, string, string] = selected
    ? [amber.glow, amber.jewel, amber.deep]
    : [walnut.grain, walnut.raised, walnut.panel];
  const ink = selected ? walnut.void : brass.light;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tune channel ${channel.number}, ${channel.name}`}
      onPress={onPress}
      style={[
        styles.stationPlateShell,
        { height },
        selected && styles.stationPlateTuned,
      ]}
    >
      <LinearGradient colors={face} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.stationPlateFace}>
        <View style={[styles.registerScrew, styles.registerScrewTL]}><View style={styles.registerScrewSlot} /></View>
        <View style={[styles.registerScrew, styles.registerScrewTR]}><View style={styles.registerScrewSlot} /></View>
        <View style={[styles.registerScrew, styles.registerScrewBL]}><View style={styles.registerScrewSlot} /></View>
        <View style={[styles.registerScrew, styles.registerScrewBR]}><View style={styles.registerScrewSlot} /></View>
        <Text style={[styles.stationNumber, { color: ink }]}>{channel.number}</Text>
        <View style={[styles.stationDivider, { backgroundColor: selected ? 'rgba(26,16,6,0.32)' : brass.shadow }]} />
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={1}
          style={[styles.stationName, { color: ink }]}
        >
          {channel.name.toUpperCase()}
        </Text>
        {tuned && <View style={[styles.stationLamp, selected && styles.stationLampOnAmber]} />}
      </LinearGradient>
    </Pressable>
  );
}

export function Home({ channels, selectedIndex, tunedIndex, onSelect, onTune, onBoard, onPower, onService, onNotes, nowPlayingMap, upNextMap, clockNow }: HomeProps) {
  const { width, height } = useWindowDimensions();
  const panelOpacity = useRef(new Animated.Value(1)).current;
  const [registerHeight, setRegisterHeight] = useState(Math.max(300, height - 180));

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

  const horizontalPadding = width < 1200 ? 32 : 48;
  const columnGap = width < 1200 ? 24 : 36;
  const registerWidth = Math.max(215, Math.min(286, width * 0.2));
  const panelWidth = Math.max(280, Math.min(460, width * 0.3));
  const centerWidth = width - horizontalPadding * 2 - columnGap * 2 - registerWidth - panelWidth;
  const dialSize = Math.max(180, Math.min(560, height - 188, centerWidth));

  const registerBodyHeight = Math.max(0, registerHeight - REGISTER_HEADER_HEIGHT);
  const allPlateHeight = channels.length > 0
    ? (registerBodyHeight - REGISTER_PLATE_GAP * (channels.length - 1)) / channels.length
    : REGISTER_MAX_PLATE_HEIGHT;
  const registerWindowed = allPlateHeight < REGISTER_MIN_PLATE_HEIGHT;
  const windowPlateArea = registerBodyHeight - (registerWindowed ? REGISTER_INDICATOR_HEIGHT * 2 : 0);
  const visibleCount = registerWindowed
    ? Math.min(
        channels.length,
        Math.max(1, Math.floor((windowPlateArea + REGISTER_PLATE_GAP) / (REGISTER_MIN_PLATE_HEIGHT + REGISTER_PLATE_GAP))),
      )
    : channels.length;
  const plateHeight = visibleCount > 0
    ? Math.max(
        REGISTER_MIN_PLATE_HEIGHT,
        Math.min(
          REGISTER_MAX_PLATE_HEIGHT,
          Math.floor((windowPlateArea - REGISTER_PLATE_GAP * (visibleCount - 1)) / visibleCount),
        ),
      )
    : REGISTER_MAX_PLATE_HEIGHT;
  const lastWindowStart = Math.max(0, channels.length - visibleCount);
  const windowStart = registerWindowed
    ? Math.min(lastWindowStart, Math.max(0, selectedIndex - Math.floor(visibleCount / 2)))
    : 0;
  const visibleChannels = channels.slice(windowStart, windowStart + visibleCount);

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

      {/* Amidships: register, dial on the remaining centerline, programme panel. */}
      <View style={[styles.midRow, { paddingHorizontal: horizontalPadding, gap: columnGap }]}>
        <View
          style={[styles.register, { width: registerWidth }]}
          onLayout={(event) => {
            const measured = Math.floor(event.nativeEvent.layout.height);
            if (measured > 0 && measured !== registerHeight) setRegisterHeight(measured);
          }}
        >
          <View style={styles.registerHeader}>
            <View style={styles.registerHeaderRule} />
            <Text style={styles.registerHeaderText}>STATION REGISTER</Text>
            <View style={styles.registerHeaderRule} />
          </View>
          <View style={styles.registerBody}>
            {registerWindowed && (
              <View
                accessibilityLabel={windowStart > 0 ? 'More stations above' : undefined}
                style={[styles.registerIndicator, windowStart === 0 && styles.registerIndicatorHidden]}
              >
                <View style={[styles.registerArrow, styles.registerArrowUp]} />
              </View>
            )}
            <View style={styles.registerPlates}>
              {visibleChannels.map((channel, visibleIndex) => {
                const index = windowStart + visibleIndex;
                const tuned = index === tunedIndex;
                const selected = index === selectedIndex;
                return (
                  <StationRegisterPlate
                    key={channel.id}
                    channel={channel}
                    height={plateHeight}
                    tuned={tuned}
                    selected={selected}
                    onPress={() => {
                      onSelect(index);
                      onTune(index);
                    }}
                  />
                );
              })}
            </View>
            {registerWindowed && (
              <View
                accessibilityLabel={windowStart + visibleCount < channels.length ? 'More stations below' : undefined}
                style={[
                  styles.registerIndicator,
                  windowStart + visibleCount >= channels.length && styles.registerIndicatorHidden,
                ]}
              >
                <View style={[styles.registerArrow, styles.registerArrowDown]} />
              </View>
            )}
          </View>
        </View>

        <View style={styles.dialColumn}>
          <Dial
            channels={channels}
            selectedIndex={selectedIndex}
            onSelect={onSelect}
            onTune={onTune}
            size={dialSize}
          />
        </View>

        <Animated.View style={[styles.panel, { width: panelWidth, opacity: panelOpacity }]}>
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
            <Plate label="DIAL" compact labelSize={10} />
            <Text style={styles.hintText}>TUNE</Text>
          </View>
          <Pressable style={styles.hint} onPress={() => onTune(selectedIndex)}>
            <Plate label="TUNE" compact labelSize={10} />
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
  },
  register: {
    flexShrink: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingBottom: 14,
  },
  registerHeader: {
    height: REGISTER_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  registerHeaderRule: {
    flex: 1,
    height: 1,
    backgroundColor: brass.shadow,
  },
  registerHeaderText: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: plateTracking(9),
    color: brass.muted,
  },
  registerBody: {
    flex: 1,
    justifyContent: 'center',
  },
  registerPlates: {
    width: '100%',
    gap: REGISTER_PLATE_GAP,
  },
  registerIndicator: {
    height: REGISTER_INDICATOR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  registerArrowUp: {
    borderBottomWidth: 7,
    borderBottomColor: brass.mid,
  },
  registerArrowDown: {
    borderTopWidth: 7,
    borderTopColor: brass.mid,
  },
  registerIndicatorHidden: {
    opacity: 0,
  },
  stationPlateShell: {
    width: '100%',
    borderRadius: 3,
    borderWidth: 1,
    borderTopColor: 'rgba(241,229,207,0.14)',
    borderLeftColor: 'rgba(241,229,207,0.08)',
    borderRightColor: 'rgba(0,0,0,0.65)',
    borderBottomColor: 'rgba(0,0,0,0.8)',
    backgroundColor: walnut.void,
  },
  stationPlateTuned: {
    shadowColor: amber.jewel,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  stationLamp: {
    position: 'absolute',
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: amber.jewel,
    shadowColor: amber.glow,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  stationLampOnAmber: {
    backgroundColor: '#7a2f0c',
    borderWidth: 1,
    borderColor: 'rgba(26,16,6,0.5)',
    shadowOpacity: 0.35,
  },
  stationPlateFace: {
    flex: 1,
    borderRadius: 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
  },
  registerScrew: {
    position: 'absolute',
    zIndex: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brass.mid,
    borderWidth: 0.5,
    borderColor: walnut.void,
  },
  registerScrewSlot: {
    width: 4,
    height: 1,
    backgroundColor: walnut.deep,
    transform: [{ rotate: '22deg' }],
  },
  registerScrewTL: { top: 3, left: 3 },
  registerScrewTR: { top: 3, right: 3 },
  registerScrewBL: { bottom: 3, left: 3 },
  registerScrewBR: { bottom: 3, right: 3 },
  stationNumber: {
    width: 45,
    textAlign: 'center',
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  stationDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 9,
    opacity: 0.7,
  },
  stationName: {
    flex: 1,
    paddingLeft: 13,
    paddingRight: 5,
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: plateTracking(13) * 0.42,
  },
  dialColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    flexShrink: 0,
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
