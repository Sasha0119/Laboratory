import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { colors, radius, spacing } from '../../theme';

interface Props extends ViewProps {
  title?: string;
  /** Small right-aligned text in the header, e.g. a live value. */
  accessory?: string;
}

/** Rounded panel used for every grouped block in the control tray. */
export function Card({ title, accessory, style, children, ...rest }: Props) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {title ? (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {accessory ? <Text style={styles.accessory}>{accessory}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.strokeSoft,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  accessory: {
    color: colors.textFaint,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
