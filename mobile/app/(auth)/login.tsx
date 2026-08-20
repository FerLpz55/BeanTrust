/** Login — flujo completo de acceso (diseño; backend se conecta en el módulo
 * siguiente). Validación por campo, error genérico anti-enumeración, estados
 * de carga y navegación de demostración hacia la finca. */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AuthShell } from '@/src/components/auth/auth-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { TextField } from '@/src/components/text-field';
import { TextLink } from '@/src/components/text-link';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useAuthStore } from '@/src/store/auth';
import { login } from '@/src/api/auth';
import { ApiError } from '@/src/api/client';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Ingresa tu correo electrónico.';
  if (!EMAIL_RE.test(email.trim())) return 'Revisa el formato del correo.';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Ingresa tu contraseña.';
  if (password.length < MIN_PASSWORD) return `Mínimo ${MIN_PASSWORD} caracteres.`;
  return null;
}

export default function LoginScreen() {
  const router = useRouter();
  const { created } = useLocalSearchParams<{ created?: string }>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading'>('idle');

  const passwordRef = useRef<TextInput>(null);

  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const errorContainer = useThemeColor('errorContainer');
  const onErrorContainer = useThemeColor('onErrorContainer');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');

  function announce(message: string) {
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }

  async function handleSubmit() {
    if (phase === 'loading') return;
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const nextErrors = { email: emailError ?? undefined, password: passwordError ?? undefined };
    setFieldErrors(nextErrors);
    setSubmitError(null);

    if (emailError || passwordError) {
      announce(emailError ?? passwordError ?? '');
      return;
    }

    setPhase('loading');
    try {
      const ok = await useAuthStore.getState().login(email.trim(), password);
      // auth store sets status='authenticated' → AppLayout redirects to tabs
      if (!ok) {
        const msg = useAuthStore.getState().error ?? 'No se pudo iniciar sesión.';
        setSubmitError(msg);
        announce(msg);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.';
      setSubmitError(msg);
      announce(msg);
    } finally {
      setPhase('idle');
    }
  }

  return (
    <AuthShell
      eyebrow="ACCESO DE PRODUCTOR"
      title="Inicia sesión"
      subtitle="Accede a tu registro de cosechas y certificados."
      signature
      footer={
        <View style={styles.footerRow}>
          <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>¿No tienes cuenta?</Text>
          <TextLink label="Crear cuenta" onPress={() => router.push('/register')} testID="login-register" />
        </View>
      }
    >
      {created === '1' ? (
        <View style={[styles.successBanner, { backgroundColor: primaryContainer }]} accessibilityLiveRegion="polite">
          <MaterialIcons name="check-circle-outline" size={18} color={onPrimaryContainer} />
          <Text style={[typeScale.bodySmall, styles.bannerText, { color: onPrimaryContainer }]}>
            Cuenta creada. Inicia sesión con tus datos.
          </Text>
        </View>
      ) : null}

      <View style={styles.form}>
        <TextField
          label="Correo electrónico"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setFieldErrors((e) => ({ ...e, email: undefined }));
          }}
          onBlur={() => setFieldErrors((e) => ({ ...e, email: validateEmail(email) ?? undefined }))}
          error={fieldErrors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          testID="login-email"
        />

        <View style={styles.passwordGroup}>
          <TextField
            ref={passwordRef}
            label="Contraseña"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setFieldErrors((e) => ({ ...e, password: undefined }));
            }}
            onBlur={() => setFieldErrors((e) => ({ ...e, password: validatePassword(password) ?? undefined }))}
            error={fieldErrors.password}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            testID="login-password"
          />
          <View style={styles.recoverRow}>
            <TextLink label="¿Olvidaste tu contraseña?" onPress={() => router.push('/recover')} testID="login-recover" />
          </View>
        </View>

        <View style={styles.errorSlot} accessibilityLiveRegion="polite">
          {submitError ? (
            <View style={[styles.errorBanner, { backgroundColor: errorContainer }]}>
              <MaterialIcons name="error-outline" size={18} color={onErrorContainer} />
              <Text style={[typeScale.bodySmall, styles.bannerText, { color: onErrorContainer }]}>
                {submitError}
              </Text>
            </View>
          ) : null}
        </View>

        <PrimaryButton
          label="Iniciar sesión"
          loadingLabel="Iniciando…"
          onPress={handleSubmit}
          loading={phase === 'loading'}
          testID="login-submit"
        />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: {
    width: '100%',
    gap: spacing.lg,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.medium,
    padding: spacing.md,
    width: '100%',
  },
  passwordGroup: {
    gap: spacing.xs,
  },
  recoverRow: {
    alignItems: 'flex-start',
  },
  errorSlot: {
    minHeight: 16,
    justifyContent: 'flex-end',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.medium,
    padding: spacing.md,
  },
  bannerText: {
    flex: 1,
  },
  footerRow: {
    alignItems: 'center',
    gap: spacing.xs,
  },
});