/** Crear cuenta de productor — conectado a `POST /v1/auth/register` (F08).
 *
 * El contrato pide `{email, password, nombre, rol}` donde `nombre` es el de la
 * persona, no el de la finca: la finca es una entidad aparte que el backend no
 * crea al registrarse. Por eso el campo captura el nombre del productor. */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthShell } from '@/src/components/auth/auth-shell';
import { useAuthStore } from '@/src/store/auth';
import { PrimaryButton } from '@/src/components/primary-button';
import { TextField } from '@/src/components/text-field';
import { TextLink } from '@/src/components/text-link';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale } from '@/src/theme/tokens';

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const router = useRouter();
  const onErrorContainer = useThemeColor('onErrorContainer');

  const register = useAuthStore((s) => s.register);
  const errorServidor = useAuthStore((s) => s.error);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ nombre?: string; email?: string; password?: string }>({});
  const [phase, setPhase] = useState<'idle' | 'loading'>('idle');

  async function handleSubmit() {
    if (phase === 'loading') return;
    const nextErrors = {
      nombre: nombre.trim().length >= 2 ? undefined : 'Ingresa tu nombre completo.',
      email: !email.trim()
        ? 'Ingresa tu correo electrónico.'
        : !EMAIL_RE.test(email.trim())
          ? 'Revisa el formato del correo.'
          : undefined,
      password: !password
        ? 'Ingresa una contraseña.'
        : password.length < MIN_PASSWORD
          ? `Mínimo ${MIN_PASSWORD} caracteres.`
          : undefined,
    };
    setFieldErrors(nextErrors);
    if (nextErrors.nombre || nextErrors.email || nextErrors.password) return;

    setPhase('loading');
    // El backend devuelve el par de tokens: al registrarse la sesión ya queda
    // abierta, así que el layout de `(auth)` redirige solo a la app.
    const creada = await register(email.trim(), password, nombre.trim(), 'productor');
    if (!creada) setPhase('idle');
  }

  return (
    <AuthShell
      eyebrow="CREAR CUENTA"
      title="Únete como productor"
      subtitle="Registra tu finca y empieza a trazar tu cosecha."
      signature
      footer={
        <TextLink label="¿Ya tienes cuenta? Inicia sesión" onPress={() => router.replace('/login')} />
      }
    >
      <View style={styles.form}>
        <TextField
          label="Tu nombre"
          value={nombre}
          onChangeText={(v) => {
            setNombre(v);
            setFieldErrors((e) => ({ ...e, nombre: undefined }));
          }}
          error={fieldErrors.nombre}
          autoCapitalize="words"
          textContentType="name"
          returnKeyType="next"
          testID="register-nombre"
        />
        <TextField
          label="Correo electrónico"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setFieldErrors((e) => ({ ...e, email: undefined }));
          }}
          error={fieldErrors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          testID="register-email"
        />
        <TextField
          label="Contraseña"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setFieldErrors((e) => ({ ...e, password: undefined }));
          }}
          error={fieldErrors.password}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          testID="register-password"
        />
        {errorServidor && phase === 'idle' ? (
          <Text
            style={[styles.error, { color: onErrorContainer }]}
            accessibilityLiveRegion="polite"
          >
            {errorServidor}
          </Text>
        ) : null}
        <PrimaryButton
          label="Crear cuenta"
          loadingLabel="Creando…"
          onPress={handleSubmit}
          loading={phase === 'loading'}
          testID="register-submit"
        />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: {
    ...typeScale.bodySmall,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    gap: spacing.lg,
  },
});