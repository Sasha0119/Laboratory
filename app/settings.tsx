import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../components/ui/Card';
import { useLanguage } from '../context/Language';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../lib/i18n';
import { colors, radius, spacing } from '../theme';

export default function Settings() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLanguage();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <Card title={t('settings.language')}>
        <Text style={styles.description}>{t('settings.languageDescription')}</Text>
        <View style={styles.list}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <LanguageRow
              key={lang.code}
              language={lang}
              selected={lang.code === language}
              onPress={() => setLanguage(lang.code)}
            />
          ))}
        </View>
      </Card>

      <View style={styles.notes}>
        <Text style={styles.note}>{t('settings.unitsNote')}</Text>
        <Text style={styles.note}>{t('settings.translationNote')}</Text>
      </View>
    </ScrollView>
  );
}

function LanguageRow({
  language,
  selected,
  onPress,
}: {
  language: SupportedLanguage;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 45, bounciness: 4 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPressIn={() => spring(0.98)}
        onPressOut={() => spring(1)}
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${language.endonym} (${language.english})`}
        style={[styles.row, selected && styles.rowSelected]}
      >
        <View style={styles.rowText}>
          {/* The language's own name leads, so it is findable by someone who
              cannot currently read the interface. */}
          <Text style={[styles.endonym, selected && { color: colors.accent }]}>
            {language.endonym}
          </Text>
          <Text style={styles.english}>{language.english}</Text>
        </View>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.sm },
  description: {
    color: colors.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  list: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.strokeSoft,
    backgroundColor: colors.bgElevated,
  },
  rowSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  rowText: { flex: 1 },
  endonym: { color: colors.text, fontSize: 16, fontWeight: '700' },
  english: { color: colors.textFaint, fontSize: 11.5, marginTop: 1 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.accent },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  notes: { gap: spacing.sm, paddingHorizontal: 2, marginTop: spacing.xs },
  note: { color: colors.textFaint, fontSize: 11.5, lineHeight: 17 },
});
