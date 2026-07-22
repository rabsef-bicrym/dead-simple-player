import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { amber, brass, fonts } from '../../constants/ds6';

/**
 * The progress needle — an amber filament running the apron's width,
 * with broadcast clock times at each end. Time on the DS-6 is wall
 * time, never media-player time.
 */

interface NeedleProps {
  start: Date;
  stop: Date;
  now?: Date;
}

function clock(d: Date): string {
  let h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function Needle({ start, stop, now = new Date() }: NeedleProps) {
  const span = stop.getTime() - start.getTime();
  const progress = span > 0 ? Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / span)) : 0;

  return (
    <View style={styles.row}>
      <Text style={styles.time}>{clock(start)}</Text>
      <View style={styles.track}>
        <LinearGradient
          colors={[amber.deep, amber.needle, amber.glow]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.fill, { width: `${progress * 100}%` }]}
        />
        <View style={[styles.tip, { left: `${progress * 100}%` }]} pointerEvents="none" />
      </View>
      <Text style={styles.time}>{clock(stop)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  time: {
    fontFamily: fonts.plate,
    fontSize: 10,
    letterSpacing: 1,
    color: brass.mid,
    fontVariant: ['tabular-nums'],
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,229,207,0.07)',
    overflow: 'visible',
  },
  fill: {
    height: 3,
    borderRadius: 2,
  },
  tip: {
    position: 'absolute',
    top: -2,
    width: 7,
    height: 7,
    marginLeft: -4,
    borderRadius: 4,
    backgroundColor: amber.glow,
    shadowColor: amber.jewel,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
