/**
 * Crear cuenta (alta pública de productor).
 *
 * El backend crea siempre un `productor` y no hay selector de roles. Al tener
 * éxito, la sesión queda activa y el grupo autenticado retoma el onboarding de
 * la primera finca.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiError } from '@/src/api/client';
import { AuthShell } from '@/src/components/auth/auth-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { TextField } from '@/src/components/text-field';
import { TextLink } from '@/src/components/text-link';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useAuthStore } from '@/src/store/auth';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Ingresa tu correo electrónico.';
  if (!EMAIL_RE.test(email.trim())) return 'Revisa el formato del correo.';
  return undefined;
}

function validatePassword(password: string): string | undefined {
  if (!password) return 'Ingresa una contraseña.';
  if (password.length < MIN_PASSWORD) return `Mínimo ${MIN_PASSWORD} caracteres.`;
  return undefined;
}

interface Errores {
  nombre?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

export default function RegisterScreen() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Errores>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading'>('idle');

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const errorContainer = useThemeColor('errorContainer');
  const onErrorContainer = useThemeColor('onErrorContainer');

  function announce(message: string) {
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }

  async function handleSubmit() {
    if (phase === 'loading') return;
    const errores: Errores = {
      nombre: nombre.trim().length >= 2 ? undefined : 'Escribe tu nombre.',
      email: validateEmail(email),
      password: validatePassword(password),
      confirm: password === confirm ? undefined : 'Las contraseñas no coinciden.',
    };
    setFieldErrors(errores);
    setSubmitError(null);

    const primero = errores.nombre ?? errores.email ?? errores.password ?? errores.confirm;
    if (primero) {
      announce(primero);
      return;
    }

    setPhase('loading');
    try {
      const ok = await useAuthStore.getState().register(email.trim(), password, nombre.trim());
      if (!ok) {
        const msg = useAuthStore.getState().error ?? 'No se pudo crear la cuenta.';
        setSubmitError(msg);
        announce(msg);
      }
      // Éxito: el store marca `authenticated`; el layout de (auth) redirige y
      // el onboarding de finca se encarga del resto.
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No se pudo crear la cuenta.';
      setSubmitError(msg);
      announce(msg);
    } finally {
      setPhase('idle');
    }
  }

  return (
    <AuthShell
      eyebrow="CREAR CUENTA"
      title="Empieza tu trazabilidad"
      subtitle="Crea tu cuenta de productor y registra tu primera finca."
      signature
      footer={
        <View style={styles.footerRow}>
          <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>¿Ya tienes cuenta?</Text>
          <TextLink
            label="Inicia sesión"
            onPress={() => router.replace('/login')}
            testID="register-ir-login"
          />
        </View>
      }
    >
      <View style={styles.form}>
        <TextField
          label="Nombre"
          value={nombre}
          onChangeText={(v) => {
            setNombre(v);
            setFieldErrors((e) => ({ ...e, nombre: undefined }));
          }}
          onBlur={() =>
            setFieldErrors((e) => ({
              ...e,
              nombre: nombre.trim().length >= 2 ? undefined : 'Escribe tu nombre.',
            }))
          }
          error={fieldErrors.nombre}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          testID="register-nombre"
        />

        <TextField
          ref={emailRef}
          label="Correo electrónico"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setFieldErrors((e) => ({ ...e, email: undefined }));
          }}
          onBlur={() => setFieldErrors((e) => ({ ...e, email: validateEmail(email) }))}
          error={fieldErrors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          testID="register-email"
        />

        <TextField
          ref={passwordRef}
          label="Contraseña"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setFieldErrors((e) => ({ ...e, password: undefined }));
          }}
          onBlur={() => setFieldErrors((e) => ({ ...e, password: validatePassword(password) }))}
          error={fieldErrors.password}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          testID="register-password"
        />

        <TextField
          ref={confirmRef}
          label="Confirmar contraseña"
          value={confirm}
          onChangeText={(v) => {
            setConfirm(v);
            setFieldErrors((e) => ({ ...e, confirm: undefined }));
          }}
          onBlur={() =>
            setFieldErrors((e) => ({
              ...e,
              confirm: password === confirm ? undefined : 'Las contraseñas no coinciden.',
            }))
          }
          error={fieldErrors.confirm}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          testID="register-confirm"
        />

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
          label="Crear cuenta"
          loadingLabel="Creando cuenta…"
          onPress={handleSubmit}
          loading={phase === 'loading'}
          testID="register-submit"
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
