import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';

interface Props {
  title: string;
  body: string;
  /** A concrete first thing to try, e.g. "Try switching to Repel below." */
  tip?: string;
  onDismiss: () => void;
}

/**
 * A one-time "what is this lesson about" explainer for readers who have
 * never met the concept before — the vocabulary and the core rule, in plain
 * language, before they ever touch a control. Distinct from `LevelBlurb`
 * (which is the ongoing "here's what's happening right now" line and stays
 * up for the whole Beginner/Intermediate session): this is a standalone
 * teaching aid shown once, and the reader dismisses it for good.
 */
export function IntroPanel({ title, body, tip, onDismiss }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {tip ? <Text style={styles.tip}>{tip}</Text> : null}
      <Pressable onPress={onDismiss} style={styles.dismissRow} accessibilityRole="button">
        <Text style={styles.dismissText}>{t('common.gotIt')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.accentGlow,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent + '55',
    padding: spacing.md,
    gap: 6,
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  body: { color: colors.text, fontSize: 13.5, lineHeight: 19.5 },
  tip: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, fontStyle: 'italic' },
  dismissRow: { alignSelf: 'flex-end', marginTop: spacing.xs, paddingVertical: 4, paddingHorizontal: 4 },
  dismissText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
});
