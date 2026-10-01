'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from '../../components/dom/index';

import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Toggle } from '../../components/ui/Toggle';
import { useAuth } from '../../context/Auth';
import { useDifficulty } from '../../context/Difficulty';
import { useLanguage } from '../../context/Language';
import { DIFFICULTY_ORDER, type DifficultyLevel } from '../../lib/difficulty';
import { SUPPORTED_LANGUAGES } from '../../lib/i18n';
import { useSoundEnabled } from '../../lib/soundSettings';
import { colors, radius, spacing } from '../../theme';

export default function Settings() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { level, setLevel } = useDifficulty();
  const [soundOn, setSoundOn] = useSoundEnabled();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl }]}
    >
      <AccountCard />

      <Card title={t('difficulty.title')}>
        <Text style={styles.description}>{t('difficulty.description')}</Text>
        <View style={styles.list}>
          {DIFFICULTY_ORDER.map((id) => (
            <ChoiceRow
              key={id}
              title={t(`difficulty.levels.${id}.label`)}
              subtitle={t(`difficulty.levels.${id}.grades`)}
              selected={id === level}
              onPress={() => setLevel(id as DifficultyLevel)}
            />
          ))}
        </View>
      </Card>

      <Card title={t('settings.language')}>
        <Text style={styles.description}>{t('settings.languageDescription')}</Text>
        <View style={styles.list}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <ChoiceRow
              key={lang.code}
              /* The language's own name leads, so it is findable by someone
                 who cannot read the current interface. */
              title={lang.endonym}
              subtitle={lang.english}
              selected={lang.code === language}
              onPress={() => setLanguage(lang.code)}
            />
          ))}
        </View>
      </Card>

      <Card title={t('settings.sound')}>
        <Toggle
          label={t('settings.soundLabel')}
          description={t('settings.soundDescription')}
          value={soundOn}
          onChange={setSoundOn}
        />
      </Card>

      <View style={styles.notes}>
        <Text style={styles.note}>{t('settings.unitsNote')}</Text>
        <Text style={styles.note}>{t('settings.translationNote')}</Text>
      </View>
    </ScrollView>
  );
}

/**
 * Account state, and the only place to sign in or out.
 *
 * Deliberately factual: who is signed in, and a way to sign out.
 */
function AccountCard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { mode, user, displayName, signOut } = useAuth();

  if (mode !== 'account') {
    return (
      <Card title={t('account.title')}>
        <Text style={styles.description}>{t('account.guestDescription')}</Text>
        <View style={styles.accountActions}>
          <Button
            label={t('account.createAccount')}
            onPress={() => router.push('/auth/sign-up')}
          />
          <Button
            label={t('account.logIn')}
            variant="ghost"
            onPress={() => router.push('/auth/sign-in')}
          />
        </View>
      </Card>
    );
  }

  return (
    <Card title={t('account.title')}>
      <View style={styles.identity}>
        <Text style={styles.name}>{displayName ?? t('account.unnamed')}</Text>
        {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
      </View>

      <View style={styles.accountActions}>
        <Button label={t('account.logOut')} variant="ghost" onPress={() => void signOut()} />
      </View>
    </Card>
  );
}

/** One selectable option, shared by the difficulty and language pickers. */
const PRESS_SCALE = 0.98;

function ChoiceRow({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <View style={{ transform: `scale(${pressed ? PRESS_SCALE : 1})`, transition: 'transform 120ms ease-out' }}>
      <Pressable
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${title} (${subtitle})`}
        style={[styles.row, selected && styles.rowSelected]}
      >
        <View style={styles.rowText}>
          <Text style={[styles.endonym, selected && { color: colors.accent }]}>{title}</Text>
          <Text style={styles.english}>{subtitle}</Text>
        </View>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
      </Pressable>
    </View>
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
  identity: { marginBottom: spacing.md },
  name: { color: colors.text, fontSize: 18, fontWeight: '800' },
  email: { color: colors.textMuted, fontSize: 12.5, marginTop: 2 },
  accountActions: { gap: spacing.sm, marginTop: spacing.md },

  notes: { gap: spacing.sm, paddingHorizontal: 2, marginTop: spacing.xs },
  note: { color: colors.textFaint, fontSize: 11.5, lineHeight: 17 },
});
