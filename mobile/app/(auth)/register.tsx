/** Alta cerrada — el registro público no está disponible (piloto).
 *
 * Las cuentas las entrega la cooperativa (Auth Admin de Supabase). Una
 * navegación directa a `/register` explica esto y ofrece ir a iniciar sesión. */

import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AuthShell } from '@/src/components/auth/auth-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale } from '@/src/theme/tokens';

export default function RegisterScreen() {
  const router = useRouter();
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');

  return (
    <AuthShell
      eyebrow="ALTA CERRADA"
      title="La cooperativa crea tu cuenta"
      subtitle="Durante el piloto no hay registro público."
      signature
    >
      <View style={styles.body}>
        <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
          BeanTrust está en fase piloto. Tu cooperativa entrega las credenciales de productor o
          comprador; después podrás iniciar sesión con ese correo y contraseña.
        </Text>
        <PrimaryButton
          label="Ir a iniciar sesión"
          onPress={() => router.replace('/login')}
          testID="register-ir-login"
        />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  body: {
    width: '100%',
    gap: spacing.lg,
  },
});
