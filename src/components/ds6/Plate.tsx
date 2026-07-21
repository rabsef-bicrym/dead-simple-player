import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
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
  kickerSize?: number;
  labelSize?: number;
}

function Screw({ size = 7 }: { size?: number }) {
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
    </Svg>
  );
}

export function Plate({ kicker, label, lit = false, compact = false, kickerSize = 10, labelSize = 15 }: PlateProps) {
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
            <View style={[styles.screw, styles.screwTL]}><Screw /></View>
            <View style={[styles.screw, styles.screwTR]}><Screw /></View>
            <View style={[styles.screw, styles.screwBL]}><Screw /></View>
            <View style={[styles.screw, styles.screwBR]}><Screw /></View>
          </>
        )}
        {kicker != null && (
          <Text style={[styles.kicker, { color: kickerColor, fontSize: kickerSize, letterSpacing: plateTracking(kickerSize) }]}>
            {kicker}
          </Text>
        )}
        <Text style={[styles.label, { color: textColor, fontSize: labelSize, letterSpacing: plateTracking(labelSize) * 0.55 }]}>
          {label}
        </Text>
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
