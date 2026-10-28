import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { brass, fonts, walnut } from '../../constants/ds6';

/** Shared glass and signal plate; each platform owns the noise underneath. */
export function TuningOverlay({ error }: { error?: string | null }) {
  return (
    <>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="staticVignette" cx="50%" cy="48%" rx="72%" ry="92%">
            <Stop offset="0%" stopColor="#000" stopOpacity={0.02} />
            <Stop offset="58%" stopColor="#000" stopOpacity={0.08} />
            <Stop offset="100%" stopColor="#000" stopOpacity={0.5} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#staticVignette)" />
      </Svg>

      <View style={styles.plateShell}>
        <View style={styles.plate}>
          <View style={[styles.screw, styles.screwLeft]} />
          <View style={[styles.screw, styles.screwRight]} />
          <Text style={styles.plateText}>
            {error ? 'THE SIGNAL WILL NOT JOIN' : 'A MOMENT, PLEASE'}
          </Text>
          {error ? <Text style={styles.detail} numberOfLines={2}>{error}</Text> : null}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  plateShell: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plate: {
    minWidth: 196,
    maxWidth: '78%',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 3,
    backgroundColor: '#24180c',
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  plateText: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 2.8,
    color: brass.bright,
    textAlign: 'center',
  },
  detail: {
    fontFamily: fonts.speech,
    fontSize: 10.5,
    lineHeight: 13,
    color: brass.muted,
    textAlign: 'center',
  },
  screw: {
    position: 'absolute',
    top: '50%',
    width: 5,
    height: 5,
    marginTop: -2.5,
    borderRadius: 2.5,
    borderWidth: 0.5,
    borderColor: brass.light,
    backgroundColor: brass.shadow,
  },
  screwLeft: { left: 8 },
  screwRight: { right: 8 },
});
