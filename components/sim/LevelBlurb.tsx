import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';
import { useDifficulty } from '../../context/Difficulty';
import { showsBlurb, type SimulationModule } from '../../lib/difficulty';
import { colors, radius, spacing } from '../../theme';

/**
 * A sentence or two saying what is actually happening, pitched at the reader's
 * level: plain description for Beginner, the same idea in proper terms for
 * Intermediate, and nothing at all for Pro — where the equations panel and the
 * full data are the explanation.
 *
 * Which text appears is decided by `lib/difficulty`, so a new simulation gets
 * this by adding `<module>.blurbs.beginner` / `.intermediate` to the locales.
 */
export function LevelBlurb({ module }: { module: SimulationModule }) {
  const { t } = useTranslation();
  const { level } = useDifficulty();

  if (!showsBlurb(level)) return null;

  return <Text style={styles.blurb}>{t(`${module}.blurbs.${level}`)}</Text>;
}

const styles = StyleSheet.create({
  blurb: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
});
