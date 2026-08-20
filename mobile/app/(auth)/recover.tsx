/** Recuperación de acceso: solicitar enlace por correo (diseño; el envío real
 * llega con la capa de auth). Dos estados: formulario y confirmación enviada. */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthShell } from '@/src/components/auth/auth-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { TextField } from '@/src/components/text-field';
import { TextLink } from '@/src/components/text-link';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RecoverScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [phase, setPhase] = useState<'form' | 'loading' | 'sent'>('form');

  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');

  function validate(value: string): string | undefined {
    if (!value.trim()) return 'Ingresa tu correo electrónico.';
    if (!EMAIL_RE.test(value.trim())) return 'Revisa el formato del correo.';
    return undefined;
  }

  function handleSend() {
    if (phase === 'loading') return;
    const error = validate(email);
    setFieldError(error);
    if (error) return;
    setPhase('loading');
    setTimeout(() => setPhase('sent'), 800);
  }

  if (phase === 'sent') {
    return (
      <AuthShell
        eyebrow="RECUPERAR ACCESO"
        title="Revisa tu correo"
        signature
        footer={
          <View style={styles.links}>
            <TextLink
              label="Reenviar el enlace"
              onPress={() => {
                setPhase('loading');
                setTimeout(() => setPhase('sent'), 800);
              }}
            />
            <TextLink label="Volver a iniciar sesión" onPress={() => router.replace('/login')} />
          </View>
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
          Te enviamos las instrucciones para recuperar tu acceso a{' '}
          <Text style={typeScale.dataMono}>{email.trim()}</Text>.
        </Text>
      </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="RECUPERAR ACCESO"
      title="Recupera tu contraseña"
      subtitle="Escribe el correo de tu finca y te enviaremos un enlace para volver a entrar."
      signature
      footer={
        <TextLink label="Volver a iniciar sesión" onPress={() => router.replace('/login')} />
      }
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
        <PrimaryButton
          label="Enviar enlace"
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
  links: {
    alignItems: 'center',
    gap: spacing.xs,
  },
});