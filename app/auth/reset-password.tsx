import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PasswordRules } from '../../components/auth/PasswordRules';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../context/Auth';
import { authErrorKey } from '../../lib/auth/errors';
import { isEmailShaped, isPasswordValid } from '../../lib/auth/password';
import { parseRecoveryLink } from '../../lib/auth/recoveryLink';
import { supabase } from '../../lib/supabase/client';
import { isSupabaseConfigured } from '../../lib/supabase/config';
import { colors, radius, spacing } from '../../theme';

/**
 * Password reset, both halves of it.
 *
 *   request  — ask for the email, send the link, say so
 *   set      — reached by following that link, choose the new password
 *
 * Which half is shown depends on whether a recovery token arrived with the
 * deep link. Keeping them in one screen means the emailed URL has one
 * destination and the two halves cannot drift apart.
 *
 * The confirmation is worded the same whether or not the address exists —
 * saying "no such account" here would turn the form into a way of testing
 * which email addresses are registered.
 */
export default function ResetPassword() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { sendPasswordReset, configured } = useAuth();

  const url = Linking.useURL();
  const [stage, setStage] = useState<'request' | 'sent' | 'set' | 'done'>('request');

  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);
  /** A link is only ever redeemed once, however many times the effect reruns. */
  const redeemed = useRef<string | null>(null);

  const emailOk = isEmailShaped(email);
  const passwordOk = isPasswordValid(password);

  // ------------------------------------------------- redeem the deep link ---

  useEffect(() => {
    if (!url || !isSupabaseConfigured || redeemed.current === url) return;

    const link = parseRecoveryLink(url);
    if (!link) return;
    redeemed.current = url;

    let cancelled = false;

    const redeem = async () => {
      const { error } =
        link.kind === 'tokenHash'
          ? await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' })
          : await supabase.auth.setSession({
              access_token: link.accessToken,
              refresh_token: link.refreshToken,
            });

      if (cancelled) return;

      if (error) {
        // Recovery links expire, and are single-use. Say that plainly and
        // leave the request form in place so a new one is one tap away.
        setFormError(t('auth.reset.linkExpired'));
        setStage('request');
        return;
      }
      setFormError(null);
      setStage('set');
    };

    void redeem();
    return () => {
      cancelled = true;
    };
  }, [url, t]);

  // ------------------------------------------------------------- actions ---

  const sendLink = async () => {
    setFormError(null);
    if (!emailOk) {
      setEmailTouched(true);
      return;
    }

    setBusy(true);
    const result = await sendPasswordReset(email);
    setBusy(false);

    if (!result.ok) {
      setFormError(t(result.errorKey));
      return;
    }
    setStage('sent');
  };

  const setNewPassword = async () => {
    setFormError(null);
    if (!passwordOk) {
      setPasswordTouched(true);
      passwordRef.current?.focus();
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setFormError(t(authErrorKey(error)));
      return;
    }
    setStage('done');
  };

  // --------------------------------------------------------------- render ---

  const body = () => {
    if (stage === 'sent') {
      return (
        <>
          <Notice
            title={t('auth.reset.sentTitle')}
            body={t('auth.reset.sentBody', { email: email.trim() })}
          />
          <Button label={t('auth.reset.backToLogIn')} onPress={() => router.back()} />
        </>
      );
    }

    if (stage === 'done') {
      return (
        <>
          <Notice title={t('auth.reset.doneTitle')} body={t('auth.reset.doneBody')} />
          <Button label={t('auth.reset.continue')} onPress={() => router.replace('/')} />
        </>
      );
    }

    if (stage === 'set') {
      return (
        <>
          <Text style={styles.intro}>{t('auth.reset.setIntro')}</Text>
          <TextField
            ref={passwordRef}
            label={t('auth.reset.newPassword')}
            value={password}
            onChangeText={setPassword}
            onBlur={() => setPasswordTouched(true)}
            secure
            showLabel={t('auth.fields.showPassword')}
            hideLabel={t('auth.fields.hidePassword')}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={setNewPassword}
            placeholder={t('auth.fields.passwordPlaceholder')}
          />
          <PasswordRules password={password} touched={passwordTouched} />
          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
          <Button
            label={busy ? t('auth.reset.working') : t('auth.reset.savePassword')}
            onPress={setNewPassword}
            disabled={busy}
          />
        </>
      );
    }

    return (
      <>
        <Text style={styles.intro}>{t('auth.reset.intro')}</Text>
        {!configured ? (
          <Text style={styles.setupWarning}>{t('auth.errors.notConfigured')}</Text>
        ) : null}
        <TextField
          label={t('auth.fields.email')}
          value={email}
          onChangeText={setEmail}
          onBlur={() => setEmailTouched(true)}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="go"
          onSubmitEditing={sendLink}
          placeholder={t('auth.fields.emailPlaceholder')}
          error={emailTouched && !emailOk ? t('auth.validation.email') : null}
        />
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        <Button
          label={busy ? t('auth.reset.working') : t('auth.reset.sendLink')}
          onPress={sendLink}
          disabled={busy}
        />
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {body()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeBody}>{body}</Text>
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
