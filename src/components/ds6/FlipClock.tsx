import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { walnut, brass, fonts } from '../../constants/ds6';

/**
 * The receiver's clock — mechanical digit modules, hinged in the middle.
 *
 * Each digit is its own little drum; when a digit changes it makes one
 * quick half-flip (squash on the hinge line and back). No perpetual
 * motion: the clock moves only when the time does.
 */

function DigitModule({ char }: { char: string }) {
  const [shown, setShown] = useState(char);
  const squash = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (char === shown) return;
    Animated.timing(squash, {
      toValue: 0,
      duration: 90,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setShown(char);
      Animated.timing(squash, {
        toValue: 1,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }, [char, shown, squash]);

  return (
    <View style={styles.module}>
      <Animated.Text style={[styles.digit, { transform: [{ scaleY: squash }] }]}>
        {shown}
      </Animated.Text>
      <View style={styles.hinge} pointerEvents="none" />
    </View>
  );
}

interface FlipClockProps {
  date: Date;
}

export function FlipClock({ date }: FlipClockProps) {
  let h = date.getHours();
  const meridiem = h >= 12 ? 'P.M.' : 'A.M.';
  h = h % 12 || 12;
  const mm = String(date.getMinutes()).padStart(2, '0');
  const chars = [...String(h), ':', mm[0], mm[1]];

  return (
    <View style={styles.row}>
      {chars.map((c, i) =>
        c === ':' ? (
          <Text key={`sep-${i}`} style={styles.sep}>:</Text>
        ) : (
          <DigitModule key={`d-${i}-${chars.length}`} char={c} />
        ),
      )}
      <View style={styles.meridiemPlate}>
        <Text style={styles.meridiem}>{meridiem}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  module: {
    backgroundColor: walnut.void,
    borderRadius: 3,
    borderWidth: 1,
    borderTopColor: 'rgba(241,229,207,0.10)',
    borderLeftColor: 'rgba(241,229,207,0.06)',
    borderRightColor: 'rgba(0,0,0,0.7)',
    borderBottomColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  digit: {
    fontFamily: fonts.flapBold,
    fontSize: 18,
    color: brass.bright,
  },
  hinge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sep: {
    fontFamily: fonts.flapBold,
    fontSize: 16,
    color: brass.mid,
    marginHorizontal: 1,
  },
  meridiemPlate: {
    backgroundColor: walnut.void,
    borderRadius: 3,
    borderWidth: 1,
    borderTopColor: 'rgba(241,229,207,0.10)',
    borderLeftColor: 'rgba(241,229,207,0.06)',
    borderRightColor: 'rgba(0,0,0,0.7)',
    borderBottomColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 5,
    marginLeft: 3,
  },
  meridiem: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 1.5,
    color: brass.mid,
  },
});
