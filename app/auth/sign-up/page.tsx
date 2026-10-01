'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '../../../components/dom/index';

import { PasswordRules } from '../../../components/auth/PasswordRules';
import { Button } from '../../../components/ui/Button';
import { TextField } from '../../../components/ui/TextField';
import { useAuth } from '../../../context/Auth';
import {
  isDisplayNameValid,
  isEmailShaped,
  isPasswordValid,
  MAX_DISPLAY_NAME_LENGTH,
} from '../../../lib/auth/password';
import { colors, radius, spacing } from '../../../theme';

/**
 * Create an account.
 *
 * Validation is inline and lives next to the field it is about: the password
 * rules tick off as they are met, and the name and email complain only once
 * they have been left or submitted. Nothing is saved for a single generic
 * "invalid input" after the fact.
 */
function SignUpForm() {
  const router = useRouter();
  const { t } = useTranslation();
  const { signUp, configured } = useAuth();
  const flow = useSearchParams().get('flow');

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ name: false, email: false, password: false });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  const nameOk = isDisplayNameValid(name);
  const emailOk = isEmailShaped(email);
  const passwordOk = isPasswordValid(password);

  const submit = async () => {
    setFormError(null);

    // Surface everything at once rather than one field per attempt.
    if (!nameOk || !emailOk || !passwordOk) {
      setTouched({ name: true, email: true, password: true });
      if (!nameOk) nameRef.current?.focus();
      else if (!emailOk) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    setBusy(true);
    const result = await signUp(email, password, name);
    setBusy(false);

    if (!result.ok) {
      setFormError(t(result.errorKey));
      return;
    }

    if (result.needsEmailConfirmation) {
      setConfirmSent(true);
      return;
    }

    // Signed straight in. Coming from the welcome screen there is nothing
    // worth going back to, so the stack is replaced rather than popped.
    if (flow === 'onboarding') router.replace('/');
    else router.back();
  };

  if (confirmSent) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl }]}
      >
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{t('auth.signUp.checkEmailTitle')}</Text>
          <Text style={styles.noticeBody}>{t('auth.signUp.checkEmailBody', { email: email.trim() })}</Text>
        </View>
        <Button
          label={t('auth.signUp.backToLogIn')}
          onPress={() =>
            router.replace(flow === 'onboarding' ? '/auth/sign-in?flow=onboarding' : '/auth/sign-in')
          }
        />
      </ScrollView>
    );
  }

  return (
    <View
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl }]}
      >
        <Text style={styles.intro}>{t('auth.signUp.intro')}</Text>

        {!configured ? <Text style={styles.setupWarning}>{t('auth.errors.notConfigured')}</Text> : null}

        <TextField
          ref={nameRef}
          label={t('auth.fields.displayName')}
          value={name}
          onChangeText={setName}
          onBlur={() => setTouched((s) => ({ ...s, name: true }))}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          autoCapitalize="words"
          autoComplete="name"
          onSubmitEditing={() => emailRef.current?.focus()}
          placeholder={t('auth.fields.displayNamePlaceholder')}
          hint={t('auth.fields.displayNameHint')}
          error={touched.name && !nameOk ? t('auth.validation.displayName') : null}
        />

        <TextField
          ref={emailRef}
          label={t('auth.fields.email')}
          value={email}
          onChangeText={setEmail}
          onBlur={() => setTouched((s) => ({ ...s, email: true }))}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder={t('auth.fields.emailPlaceholder')}
          error={touched.email && !emailOk ? t('auth.validation.email') : null}
        />

        <TextField
          ref={passwordRef}
          label={t('auth.fields.password')}
          value={password}
          onChangeText={setPassword}
          onBlur={() => setTouched((s) => ({ ...s, password: true }))}
          secure
          showLabel={t('auth.fields.showPassword')}
          hideLabel={t('auth.fields.hidePassword')}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          onSubmitEditing={submit}
          placeholder={t('auth.fields.passwordPlaceholder')}
        />
        <PasswordRules password={password} touched={touched.password} />

        {formError ? <Text style={styles.formError}>{formError}</Text> : null}

        <Button
          label={busy ? t('auth.signUp.working') : t('auth.signUp.submit')}
          onPress={submit}
          disabled={busy}
        />

        <Pressable
          onPress={() =>
            router.replace(flow === 'onboarding' ? '/auth/sign-in?flow=onboarding' : '/auth/sign-in')
          }
          accessibilityRole="button"
          style={styles.link}
        >
          <Text style={styles.linkText}>{t('auth.signUp.haveAccount')}</Text>
        </Pressable>

        <Text style={styles.privacy}>{t('auth.signUp.privacyNote')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: spacing.md },
  intro: { color: colors.textMuted, fontSize: 13.5, lineHeight: 20, marginBottom: spacing.lg },
  setupWarning: {
    color: colors.amber,
    fontSize: 12.5,
    lineHeight: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  formError: {
    color: colors.amber,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  link: { paddingVertical: spacing.md, alignItems: 'center' },
  linkText: { color: colors.accent, fontSize: 13.5, fontWeight: '600' },
  privacy: {
    color: colors.textFaint,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  notice: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  noticeTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  noticeBody: { color: colors.textMuted, fontSize: 13.5, lineHeight: 20 },
});

// `useSearchParams` needs a Suspense boundary above it for static rendering.
export default function SignUp() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}
