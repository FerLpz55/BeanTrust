/** Crear cuenta de productor (diseño; el alta real llega con la capa de auth).
 * Campos mínimos: finca, correo y contraseña (sin doble confirmación). */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthShell } from '@/src/components/auth/auth-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { TextField } from '@/src/components/text-field';
import { TextLink } from '@/src/components/text-link';
import { spacing } from '@/src/theme/tokens';

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const router = useRouter();

  const [finca, setFinca] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ finca?: string; email?: string; password?: string }>({});
  const [phase, setPhase] = useState<'idle' | 'loading'>('idle');

  function handleSubmit() {
    if (phase === 'loading') return;
    const nextErrors = {
      finca: finca.trim() ? undefined : 'Ingresa el nombre de tu finca.',
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
    if (nextErrors.finca || nextErrors.email || nextErrors.password) return;

    setPhase('loading');
    setTimeout(() => {
      router.replace({ pathname: '/login', params: { created: '1' } });
    }, 900);
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
          label="Nombre de tu finca"
          value={finca}
          onChangeText={(v) => {
            setFinca(v);
            setFieldErrors((e) => ({ ...e, finca: undefined }));
          }}
          error={fieldErrors.finca}
          autoCapitalize="words"
          textContentType="organizationName"
          returnKeyType="next"
          testID="register-finca"
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
  form: {
    width: '100%',
    gap: spacing.lg,
  },
});