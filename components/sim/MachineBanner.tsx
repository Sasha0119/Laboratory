import { StyleSheet, Text, View } from '../dom/index';
import { colors, radius, spacing } from '../../theme';

interface Props {
  /** The big mark, e.g. "×3". */
  badge: string;
  /** The mechanical advantage in a sentence pitched at the reader's level. */
  headline: string;
  /** Whether the user's effort is enough, and what is needed if not. */
  verdict: string;
  enough: boolean;
  /** Force traded for distance, and how far each end moves. */
  tradeoff: string;
  distances: string;
  /** Tints the badge: advantage, none, or a disadvantage. */
  tone: string;
}

/**
 * The answer to "what does this machine do for me?", always on screen: the
 * mechanical advantage as a big mark and a sentence, whether the user's effort
 * is enough, and the trade that makes it work (less force, more distance).
 */
export function MachineBanner({ badge, headline, verdict, enough, tradeoff, distances, tone }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.badge, { borderColor: tone + '88', backgroundColor: tone + '1F' }]}>
          <Text style={[styles.badgeText, { color: tone }]}>{badge}</Text>
        </View>
        <Text style={styles.headline}>{headline}</Text>
      </View>

      <View style={[styles.verdict, { borderLeftColor: enough ? colors.accent : colors.rose }]}>
        <Text style={[styles.verdictText, { color: enough ? colors.accent : colors.rose }]}>{verdict}</Text>
      </View>

      <Text style={styles.tradeoff}>{tradeoff}</Text>
      <Text style={styles.distances}>{distances}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: spacing.md,
    gap: spacing.sm,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: {
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  badgeText: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' },
  headline: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  verdict: { borderLeftWidth: 3, paddingLeft: spacing.sm },
  verdictText: { fontSize: 13.5, fontWeight: '700', lineHeight: 19 },
  tradeoff: { color: colors.text, fontSize: 13, lineHeight: 19 },
  distances: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
});
