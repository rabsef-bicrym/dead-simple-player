import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, spacing } from '../src/constants/theme';

/** Channel list screen — placeholder until parsers are built. */
export default function ChannelsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Channels — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  text: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
  },
});
