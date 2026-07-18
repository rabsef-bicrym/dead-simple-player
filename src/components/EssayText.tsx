import { useMemo } from 'react';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { colors, spacing, fontSize } from '../constants/theme';
import { parseEssay } from '../parsers/essay';

/**
 * The library's NFO plots are researched essays — production histories,
 * cast biographies, broadcast context — written in a liner-notes voice.
 * This renderer typesets them accordingly instead of dumping one grey blob:
 * serif body text (Georgia on iOS, Noto Serif on Android), a brighter lede
 * paragraph, and MST3K section markers rendered as headers.
 */

interface EssayTextProps {
  text: string;
}

export function EssayText({ text }: EssayTextProps) {
  const sections = useMemo(() => parseEssay(text), [text]);

  return (
    <View>
      {sections.map((section, si) => (
        <View key={si}>
          {section.header && (
            <Text style={styles.sectionHeader}>{section.header}</Text>
          )}
          {section.paragraphs.map((paragraph, pi) => (
            <Text
              key={pi}
              style={[
                styles.paragraph,
                si === 0 && pi === 0 && !section.header && styles.lede,
              ]}
            >
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const serif = Platform.select({ ios: 'Georgia', default: 'serif' });

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.accent,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  paragraph: {
    fontFamily: serif,
    fontSize: fontSize.md,
    lineHeight: 26,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  lede: {
    color: colors.text,
    fontSize: fontSize.md + 1,
    lineHeight: 27,
  },
});
