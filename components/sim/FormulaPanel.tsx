import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDifficulty } from '../../context/Difficulty';
import { formulaDisplayFor, formulasFor, type SimulationModule } from '../../lib/difficulty';
import { colors, radius, spacing } from '../../theme';
import { Card } from '../ui/Card';

interface Props {
  module: SimulationModule;
}

/**
 * "How it's calculated" — the equations behind a simulation.
 *
 * Which equations appear, and whether the section starts open, both come from
 * `lib/difficulty`: nothing at Beginner, folded away at Intermediate, expanded
 * at Pro. A new module gets this for free by adding a `FORMULAS` entry.
 *
 * The equations themselves are notation, not prose, so they are identical in
 * every language — only their captions are translated.
 */
export function FormulaPanel({ module }: Props) {
  const { t } = useTranslation();
  const { level } = useDifficulty();
  const display = formulaDisplayFor(level);
  const formulas = formulasFor(module, level);
  const [open, setOpen] = useState(display === 'open');

  if (display === 'hidden' || formulas.length === 0) return null;

  const expanded = display === 'open' || open;

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        // At Pro the section is always expanded, so there is nothing to press.
        disabled={display === 'open'}
        accessibilityRole={display === 'open' ? 'header' : 'button'}
        accessibilityState={{ expanded }}
        style={styles.header}
      >
        <Text style={styles.title}>{t('formulas.title')}</Text>
        {display === 'collapsible' ? (
          <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
        ) : null}
      </Pressable>

      {expanded ? (
        <View style={styles.list}>
          {formulas.map((formula) => (
            <View key={formula.id} style={styles.item}>
              <Text style={styles.caption}>
                {t(`formulas.${module}.${formula.id}`)}
              </Text>
              <View style={styles.expressionWrap}>
                <Text style={styles.expression} selectable>
                  {formula.expression}
                </Text>
              </View>
            </View>
          ))}
          <Text style={styles.footnote}>{t('formulas.footnote')}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.sm + 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  title: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  chevron: { color: colors.accent, fontSize: 15, fontWeight: '700', lineHeight: 18 },
  list: { marginTop: spacing.sm, gap: spacing.sm },
  item: { gap: 4 },
  caption: { color: colors.textMuted, fontSize: 12 },
  expressionWrap: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  expression: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  footnote: {
    color: colors.textFaint,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 2,
  },
});
