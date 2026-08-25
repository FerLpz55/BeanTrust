/**
 * Recuperación de acceso — conectada a `POST /v1/auth/recover` y
 * `/recover/confirm` (B14).
 *
 * En desarrollo el backend devuelve `token_dev` porque no hay envío de correo:
 * en ese caso la pantalla ofrece fijar la contraseña ahí mismo. En producción
 * (Supabase Auth, B11) el enlace llega por email y ese bloque no aparece.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import * as authApi from '@/src/api/auth';
import { ApiError } from '@/src/api/client';
import { AuthShell } from '@/src/components/auth/auth-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { TextField } from '@/src/components/text-field';
import { TextLink } from '@/src/components/text-link';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

type Phase = 'form' | 'loading' | 'sent' | 'guardando' | 'done';

export default function RecoverScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tokenDev, setTokenDev] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('form');

  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');
  const onErrorContainer = useThemeColor('onErrorContainer');

  function validate(value: string): string | undefined {
    if (!value.trim()) return 'Ingresa tu correo electrónico.';
    if (!EMAIL_RE.test(value.trim())) return 'Revisa el formato del correo.';
    return undefined;
  }

  async function handleSend() {
    if (phase === 'loading') return;
    const invalido = validate(email);
    setFieldError(invalido);
    if (invalido) return;

    setPhase('loading');
    setError(null);
    try {
      const respuesta = await authApi.recover(email.trim());
      setTokenDev(respuesta.token_dev);
      setPhase('sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la solicitud.');
      setPhase('form');
    }
  }

  async function handleConfirm() {
    if (!tokenDev || phase === 'guardando') return;
    if (password.length < MIN_PASSWORD) {
      setFieldError(`Mínimo ${MIN_PASSWORD} caracteres.`);
      return;
    }
    setPhase('guardando');
    setError(null);
    try {
      await authApi.recoverConfirm(tokenDev, password);
      setPhase('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar la contraseña.');
      setPhase('sent');
    }
  }

  if (phase === 'done') {
    return (
      <AuthShell
        eyebrow="RECUPERAR ACCESO"
        title="Contraseña actualizada"
        signature
        footer={<TextLink label="Ir a iniciar sesión" onPress={() => router.replace('/login')} />}
      >
        <View style={styles.sentContent}>
          <View
            style={[styles.sentIcon, { backgroundColor: primaryContainer }]}
            accessibilityElementsHidden
          >
            <MaterialIcons name="check" size={28} color={onPrimaryContainer} />
          </View>
          <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }, styles.center]}>
            Ya puedes entrar con tu nueva contraseña.
          </Text>
        </View>
      </AuthShell>
    );
  }

  if (phase === 'sent' || phase === 'guardando') {
    return (
      <AuthShell
        eyebrow="RECUPERAR ACCESO"
        title={tokenDev ? 'Elige tu nueva contraseña' : 'Revisa tu correo'}
        signature
        footer={
          <TextLink label="Volver a iniciar sesión" onPress={() => router.replace('/login')} />
        }
      >
        <View style={styles.sentContent}>
          <View
            style={[styles.sentIcon, { backgroundColor: primaryContainer }]}
            accessibilityElementsHidden
          >
            <MaterialIcons name="mail-outline" size={28} color={onPrimaryContainer} />
          </View>
          <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }, styles.center]}>
            Si <Text style={typeScale.dataMono}>{email.trim()}</Text> está registrado, enviamos las
            instrucciones para recuperar el acceso.
          </Text>

          {tokenDev ? (
            <View style={styles.form}>
              <TextField
                label="Nueva contraseña"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setFieldError(undefined);
                }}
                error={fieldError}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleConfirm}
                testID="recover-password"
              />
              {error ? (
                <Text
                  style={[styles.error, { color: onErrorContainer }]}
                  accessibilityLiveRegion="polite"
                >
                  {error}
                </Text>
              ) : null}
              <PrimaryButton
                label="Cambiar contraseña"
                loadingLabel="Guardando…"
                onPress={handleConfirm}
                loading={phase === 'guardando'}
                testID="recover-confirm"
              />
            </View>
          ) : null}
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="RECUPERAR ACCESO"
      title="Recupera tu contraseña"
      subtitle="Escribe tu correo y te enviaremos las instrucciones para volver a entrar."
      signature
      footer={<TextLink label="Volver a iniciar sesión" onPress={() => router.replace('/login')} />}
    >
      <View style={styles.form}>
        <TextField
          label="Correo electrónico"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setFieldError(undefined);
          }}
          onBlur={() => setFieldError(validate(email))}
          error={fieldError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="done"
          onSubmitEditing={handleSend}
          testID="recover-email"
        />
        {error ? (
          <Text
            style={[styles.error, { color: onErrorContainer }]}
            accessibilityLiveRegion="polite"
          >
            {error}
          </Text>
        ) : null}
        <PrimaryButton
          label="Enviar instrucciones"
          loadingLabel="Enviando…"
          onPress={handleSend}
          loading={phase === 'loading'}
          testID="recover-submit"
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
  error: {
    ...typeScale.bodySmall,
    textAlign: 'center',
  },
  sentContent: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.lg,
  },
  center: {
    textAlign: 'center',
  },
  sentIcon: {
    borderRadius: radii.full,
    padding: spacing.lg,
  },
});
