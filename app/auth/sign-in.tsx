import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../context/Auth';
import { isEmailShaped } from '../../lib/auth/password';
import { colors, radius, spacing } from '../../theme';

/**
 * Log in to an existing account.
 *
 * The password rules are deliberately not repeated here — an existing password
 * predates them, and telling someone their working password is invalid would
 * be nonsense. Only the shape of the email is checked before the round trip.
 */
export default function SignIn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { signIn, continueAsGuest, configured } = useAuth();
  const { flow } = useLocalSearchParams<{ flow?: string }>();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailOk = isEmailShaped(email);
  const passwordEntered = password.length > 0;

  const submit = async () => {
    setFormError(null);

    if (!emailOk || !passwordEntered) {
      setTouched({ email: true, password: true });
      if (!emailOk) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);

    if (!result.ok) {
      setFormError(t(result.errorKey));
      return;
    }

    if (flow === 'onboarding') router.replace('/');
    else router.back();
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
        <Text style={styles.intro}>{t('auth.signIn.intro')}</Text>

        {!configured ? <Text style={styles.setupWarning}>{t('auth.errors.notConfigured')}</Text> : null}

        <TextField
          ref={emailRef}
          label={t('auth.fields.email')}
          value={email}
          onChangeText={setEmail}
          onBlur={() => setTouched((s) => ({ ...s, email: true }))}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="next"
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
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          placeholder={t('auth.fields.passwordPlaceholder')}
          error={
            touched.password && !passwordEntered ? t('auth.validation.passwordRequired') : null
          }
        />

        {formError ? <Text style={styles.formError}>{formError}</Text> : null}

        <Button
          label={busy ? t('auth.signIn.working') : t('auth.signIn.submit')}
          onPress={submit}
          disabled={busy}
        />

        <View style={styles.links}>
          <Pressable
            onPress={() => router.push('/auth/reset-password')}
            accessibilityRole="button"
            style={styles.link}
          >
            <Text style={styles.linkText}>{t('auth.signIn.forgotPassword')}</Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.replace(flow === 'onboarding' ? '/auth/sign-up?flow=onboarding' : '/auth/sign-up')
            }
            accessibilityRole="button"
            style={styles.link}
          >
            <Text style={styles.linkText}>{t('auth.signIn.noAccount')}</Text>
          </Pressable>

          {flow === 'onboarding' ? (
            <Pressable
              onPress={() => {
                continueAsGuest();
                router.replace('/');
              }}
              accessibilityRole="button"
              style={styles.link}
            >
              <Text style={styles.linkMuted}>{t('auth.welcome.continueAsGuest')}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  links: { marginTop: spacing.xs },
  link: { paddingVertical: spacing.sm + 2, alignItems: 'center' },
  linkText: { color: colors.accent, fontSize: 13.5, fontWeight: '600' },
  linkMuted: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
});
