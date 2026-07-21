import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, G, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, amber, fonts, plateTracking } from '../../constants/ds6';

/**
 * A stamped faceplate — the atomic unit of the DS-6.
 *
 * Resting plates are walnut-dark metal with brass-etched lettering.
 * A lit plate is backlit amber, like the channel indicator on a warm
 * receiver. Screws hold the corners because of course they do.
 */

interface PlateProps {
  /** Small tracked line above the label (e.g. "CHANNEL 4"). */
  kicker?: string;
  /** The stamped text (e.g. "MOVIES"). */
  label: string;
  lit?: boolean;
  /** Compact plates drop the screws (key hints, small controls). */
  compact?: boolean;
  /** A live amber jewel ahead of the text — "this lamp means it's real". */
  jewel?: boolean;
  kickerSize?: number;
  labelSize?: number;
}

/**
 * A slotted brass screw. Broadcast-console labels were engraved phenolic
 * tags mounted with small slotted screws (rivets were for permanent data
 * plates), so the DS-6 uses screws with a clear conscience.
 *
 * The slot angle comes from `seed` and is deliberately unclocked —
 * aligned slots are the tell of a fake panel. Same seed, same angle, so
 * plates don't shimmer on re-render.
 */
function Screw({ size = 7, seed = 0 }: { size?: number; seed?: number }) {
  // Cheap stable hash → angle in [0, 180).
  const angle = ((seed * 137.508) % 180 + 180) % 180;
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      <Defs>
        <RadialGradient id="screw" cx="35%" cy="30%" r="75%">
          <Stop offset="0%" stopColor={brass.light} />
          <Stop offset="65%" stopColor={brass.shadow} />
          <Stop offset="100%" stopColor="#2c1e0e" />
        </RadialGradient>
      </Defs>
      <Circle cx="5" cy="5" r="5" fill="url(#screw)" />
      <G rotation={angle} origin="5, 5">
        {/* groove, with a catch-light on its lower lip */}
        <Rect x="1.1" y="4.35" width="7.8" height="1.3" rx="0.6" fill="rgba(12,7,2,0.85)" />
        <Rect x="1.4" y="5.55" width="7.2" height="0.5" rx="0.25" fill="rgba(241,229,207,0.28)" />
      </G>
    </Svg>
  );
}

export function Plate({ kicker, label, lit = false, compact = false, jewel = false, kickerSize = 10, labelSize = 15 }: PlateProps) {
  // Each plate's screws sit at their own angles, stable per label —
  // the panel was assembled by a human, once.
  let seedBase = 0;
  for (let i = 0; i < label.length; i++) seedBase = (seedBase * 31 + label.charCodeAt(i)) | 0;
  seedBase = Math.abs(seedBase);

  const face: [string, string, string] = lit
    ? [amber.glow, amber.jewel, amber.deep]
    : [walnut.grain, walnut.raised, walnut.panel];
  const textColor = lit ? walnut.void : brass.light;
  const kickerColor = lit ? 'rgba(26,16,6,0.75)' : brass.mid;

  return (
    <View style={[styles.shell, lit && styles.litShell]}>
      <LinearGradient colors={face} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.face, compact && styles.faceCompact]}>
        {!compact && (
          <>
            <View style={[styles.screw, styles.screwTL]}><Screw seed={seedBase + 1} /></View>
            <View style={[styles.screw, styles.screwTR]}><Screw seed={seedBase + 2} /></View>
            <View style={[styles.screw, styles.screwBL]}><Screw seed={seedBase + 3} /></View>
            <View style={[styles.screw, styles.screwBR]}><Screw seed={seedBase + 4} /></View>
          </>
        )}
        {kicker != null && (
          <Text style={[styles.kicker, { color: kickerColor, fontSize: kickerSize, letterSpacing: plateTracking(kickerSize) }]}>
            {kicker}
          </Text>
        )}
        <View style={styles.labelRow}>
          {jewel && <View style={styles.jewel} />}
          <Text style={[styles.label, { color: textColor, fontSize: labelSize, letterSpacing: plateTracking(labelSize) * 0.55 }]}>
            {label}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 3,
    borderWidth: 1,
    borderTopColor: 'rgba(241,229,207,0.14)',
    borderLeftColor: 'rgba(241,229,207,0.08)',
    borderRightColor: 'rgba(0,0,0,0.65)',
    borderBottomColor: 'rgba(0,0,0,0.8)',
    backgroundColor: walnut.void,
  },
  litShell: {
    shadowColor: amber.jewel,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  face: {
    borderRadius: 2,
    paddingVertical: 9,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceCompact: {
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  kicker: {
    fontFamily: fonts.plate,
    marginBottom: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  jewel: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: amber.jewel,
    shadowColor: amber.glow,
    shadowOpacity: 0.95,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  label: {
    fontFamily: fonts.plate,
    fontWeight: '700',
  },
  screw: { position: 'absolute' },
  screwTL: { top: 3, left: 3 },
  screwTR: { top: 3, right: 3 },
  screwBL: { bottom: 3, left: 3 },
  screwBR: { bottom: 3, right: 3 },
});
