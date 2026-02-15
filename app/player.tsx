import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize } from '../src/constants/theme';

/** Full-screen player — placeholder. */
export default function PlayerScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Player — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
  },
});
