import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { checkPassword } from '../../lib/auth/password';
import { colors, spacing } from '../../theme';

/**
 * The password rules, live.
 *
 * Every rule is on screen from the start and ticks itself off as it is met, so
 * the requirements are something the user reads while typing rather than
 * something they are told after failing. Unmet rules are drawn in muted grey,
 * not red: nothing is wrong yet, it is simply not finished.
 */
export function PasswordRules({ password, touched }: { password: string; touched: boolean }) {
  const { t } = useTranslation();
  const rules = checkPassword(password);

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      {rules.map((rule) => (
        <View key={rule.id} style={styles.row}>
          <Mark met={rule.met} />
          <Text
            style={[
              styles.text,
              rule.met && styles.textMet,
              // Only once the field has been left do unmet rules take on any
              // urgency — while typing they stay quiet.
              !rule.met && touched && styles.textPending,
            ]}
          >
            {t(`auth.password.rules.${rule.id}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Mark({ met }: { met: boolean }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      {met ? (
        <Path
          d="M2.6 7.4 L5.6 10.4 L11.4 3.9"
          stroke={colors.accent}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <Path
          d="M3.5 7 H10.5"
          stroke={colors.textFaint}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 5, marginTop: -spacing.sm, marginBottom: spacing.md, paddingHorizontal: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { color: colors.textFaint, fontSize: 12, lineHeight: 17 },
  textMet: { color: colors.accent },
  textPending: { color: colors.amber },
});
