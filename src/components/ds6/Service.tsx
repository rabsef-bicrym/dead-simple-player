import { View, Text, TextInput, Pressable, StyleSheet, type TextInputProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { walnut, brass, amber, cream, fonts } from '../../constants/ds6';

/**
 * The service side of the DS-6 — shared fittings for the antenna
 * terminals (setup) and the service panel (settings). Tracked labels,
 * dark inset terminals you type into, and plate buttons in walnut or
 * lit amber.
 */

export function ServiceLabel({ children, dim = false }: { children: string; dim?: boolean }) {
  return <Text style={[styles.label, dim && { color: '#6e5f4b' }]}>{children}</Text>;
}

interface TerminalInputProps extends TextInputProps {
  /** Courier for addresses and numbers; Newsreader for names. */
  mono?: boolean;
}

export function TerminalInput({ mono = false, style, ...rest }: TerminalInputProps) {
  return (
    <TextInput
      style={[styles.terminal, mono ? styles.terminalMono : styles.terminalSpeech, style]}
      placeholderTextColor="#6e5f4b"
      selectionColor={amber.jewel}
      autoCorrect={false}
      {...rest}
    />
  );
}

interface PlateButtonProps {
  label: string;
  onPress: () => void;
  lit?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

export function PlateButton({ label, onPress, lit = false, disabled = false, compact = false }: PlateButtonProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.plateShell, lit && styles.plateShellLit, disabled && { opacity: 0.55 }]}>
      <LinearGradient
        colors={lit ? ['#f2bd6b', '#d99b3f'] : [walnut.grain, '#231507']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.plateFace, compact && styles.plateFaceCompact]}
      >
        <Text style={[styles.plateText, { color: lit ? '#2a1a08' : brass.bright }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/** The pilot lamp — dark until the set finds the signal. */
export function Lamp({ lit, size = 8 }: { lit: boolean; size?: number }) {
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        lit
          ? { backgroundColor: amber.jewel, shadowColor: amber.glow, shadowOpacity: 0.95, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 4 }
          : { backgroundColor: '#3a2c1a', borderWidth: 1, borderColor: walnut.void },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.plate,
    fontSize: 8.5,
    letterSpacing: 2.4,
    color: brass.mid,
  },
  terminal: {
    marginTop: 6,
    backgroundColor: '#170e07',
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 3,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: brass.etch,
  },
  terminalMono: {
    fontFamily: fonts.flapBold,
    fontSize: 16,
  },
  terminalSpeech: {
    fontFamily: fonts.speech,
    fontSize: 16,
    color: cream,
  },
  plateShell: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
    alignSelf: 'flex-start',
  },
  plateShellLit: {
    shadowColor: amber.jewel,
    shadowOpacity: 0.3,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
  },
  plateFace: {
    borderRadius: 2,
    paddingVertical: 12,
    paddingHorizontal: 46,
  },
  plateFaceCompact: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  plateText: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 3,
  },
});
