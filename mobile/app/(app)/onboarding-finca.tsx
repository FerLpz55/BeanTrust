/**
 * Onboarding: configurar la primera finca del productor.
 *
 * El `id` de la finca se genera una sola vez al abrir la pantalla y se reutiliza
 * en los reintentos, así que un doble toque o un corte de red no crean dos
 * fincas. La cooperativa del piloto la asigna el servidor.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/src/api/client';
import { BrandMark } from '@/src/components/brand-mark';
import { PrimaryButton } from '@/src/components/primary-button';
import { TextField } from '@/src/components/text-field';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useAuthStore } from '@/src/store/auth';
import { usePerfilStore } from '@/src/store/perfil';
import { radii, spacing, typeScale } from '@/src/theme/tokens';
import { nuevaClaveIdempotencia } from '@/src/utils/idempotencia';

interface Errores {
  nombre?: string;
  municipio?: string;
  altitudes?: string;
}

export default function OnboardingFincaScreen() {
  const rol = useAuthStore((s) => s.rol);
  const fincas = usePerfilStore((s) => s.fincas);
  const cargado = usePerfilStore((s) => s.cargado);
  const crearFinca = usePerfilStore((s) => s.crearFinca);

  // UUID estable por intento de alta (idempotencia).
  const [fincaId] = useState(() => nuevaClaveIdempotencia());
  const [nombre, setNombre] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [altMin, setAltMin] = useState('');
  const [altMax, setAltMax] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const secondaryContainer = useThemeColor('secondaryContainer');
  const onSecondaryContainer = useThemeColor('onSecondaryContainer');
  const errorContainer = useThemeColor('errorContainer');
  const onErrorContainer = useThemeColor('onErrorContainer');

  // Ya tiene finca (o no es productor): no hay nada que configurar aquí.
  useEffect(() => {
    if (rol && rol !== 'productor') router.replace('/');
    else if (cargado && fincas.length > 0) router.replace('/');
  }, [rol, cargado, fincas.length]);

  function numeroOpcional(valor: string): number | null {
    const limpio = valor.trim();
    if (!limpio) return null;
    return Number(limpio);
  }

  async function guardar() {
    if (guardando) return;
    const min = numeroOpcional(altMin);
    const max = numeroOpcional(altMax);
    const siguientes: Errores = {
      nombre: nombre.trim() ? undefined : 'Escribe el nombre de tu finca.',
      municipio: municipio.trim() ? undefined : 'Escribe el municipio.',
    };
    const invalida = (n: number | null) => n !== null && (Number.isNaN(n) || n < 0);
    if (invalida(min) || invalida(max)) {
      siguientes.altitudes = 'La altitud debe ser un número positivo.';
    } else if (min !== null && max !== null && min > max) {
      siguientes.altitudes = 'La altitud mínima no puede superar la máxima.';
    }
    setErrores(siguientes);
    if (siguientes.nombre || siguientes.municipio || siguientes.altitudes) return;

    setGuardando(true);
    setError(null);
    try {
      await crearFinca({
        id: fincaId,
        nombre: nombre.trim(),
        municipio: municipio.trim(),
        altitud_min: min,
        altitud_max: max,
      });
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar tu finca.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: useThemeColor('background') }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <BrandMark size={40} />
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>PRIMERA FINCA</Text>
          <Text style={[typeScale.headlineMedium, { color: onSurface }]}>Configura tu finca</Text>
          <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
            Aún no tienes fincas registradas. Crea la primera para empezar a registrar cosechas.
          </Text>
        </View>

        <View style={[styles.info, { backgroundColor: secondaryContainer }]}>
          <MaterialIcons name="info-outline" size={20} color={onSecondaryContainer} />
          <Text style={[typeScale.bodySmall, styles.infoText, { color: onSecondaryContainer }]}>
            Tu finca quedará asociada a la cooperativa del piloto, que podrá gestionar la venta de
            tus lotes. Tú conservas la trazabilidad y el Pasaporte de Café.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: surfaceContainerLow, borderRadius: radii.large }]}>
          <TextField
            label="Nombre de la finca"
            value={nombre}
            onChangeText={(v) => {
              setNombre(v);
              setErrores((e) => ({ ...e, nombre: undefined }));
            }}
            error={errores.nombre}
            autoCapitalize="words"
            returnKeyType="next"
            testID="onboarding-nombre"
          />
          <TextField
            label="Municipio"
            value={municipio}
            onChangeText={(v) => {
              setMunicipio(v);
              setErrores((e) => ({ ...e, municipio: undefined }));
            }}
            error={errores.municipio}
            autoCapitalize="words"
            returnKeyType="next"
            testID="onboarding-municipio"
          />
          <View style={styles.altitudesRow}>
            <View style={styles.altitudField}>
              <TextField
                label="Altitud mín. (msnm)"
                value={altMin}
                onChangeText={(v) => {
                  setAltMin(v);
                  setErrores((e) => ({ ...e, altitudes: undefined }));
                }}
                keyboardType="number-pad"
                returnKeyType="next"
                testID="onboarding-alt-min"
              />
            </View>
            <View style={styles.altitudField}>
              <TextField
                label="Altitud máx. (msnm)"
                value={altMax}
                onChangeText={(v) => {
                  setAltMax(v);
                  setErrores((e) => ({ ...e, altitudes: undefined }));
                }}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={guardar}
                testID="onboarding-alt-max"
              />
            </View>
          </View>
          {errores.altitudes ? (
            <Text style={[typeScale.bodySmall, { color: onErrorContainer }]}>
              {errores.altitudes}
            </Text>
          ) : null}
        </View>

        <View style={styles.errorSlot} accessibilityLiveRegion="polite">
          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: errorContainer }]}>
              <MaterialIcons name="error-outline" size={18} color={onErrorContainer} />
              <Text style={[typeScale.bodySmall, styles.errorText, { color: onErrorContainer }]}>
                {error}
              </Text>
            </View>
          ) : null}
        </View>

        <PrimaryButton
          label="Guardar mi finca"
          loadingLabel="Guardando…"
          onPress={guardar}
          loading={guardando}
          testID="onboarding-submit"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.medium,
    padding: spacing.md,
  },
  infoText: {
    flex: 1,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  altitudesRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  altitudField: {
    flex: 1,
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
  errorText: {
    flex: 1,
  },
});
