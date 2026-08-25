/**
 * Panel de Comercio Justo (F04/F13) - `GET /v1/mercado/{lote_id}` (B16, ADR-9).
 *
 * Proyeccion de **solo lectura**: los montos 97/3 los materializa el backend.
 * La unica escritura es la propina (`POST /v1/propinas`), idempotente y
 * reservada al comprador de la venta (§10). Dinero simulado: web3 en pausa (B7).
 */

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { DonutChart } from '@/src/components/donut-chart';
import { PrimaryButton } from '@/src/components/primary-button';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { ApiError } from '@/src/api/client';
import { useAuthStore } from '@/src/store/auth';
import { useMercadoStore } from '@/src/store/mercado';
import { nuevaClaveIdempotencia } from '@/src/utils/idempotencia';
import { spacing, typeScale, radii } from '@/src/theme/tokens';
import { EmptyState } from '@/src/components/empty-state';

export default function LoteComercioJustoScreen() {
  const { loteId } = useLocalSearchParams<{ loteId: string }>();
  const rol = useAuthStore((s) => s.rol);
  const lote = useMercadoStore((s) => (loteId ? s.paneles[loteId] : undefined));
  const cargarPanel = useMercadoStore((s) => s.cargarPanel);
  const enviarPropina = useMercadoStore((s) => s.enviarPropina);
  const enviando = useMercadoStore((s) => s.enviando);
  const errorStore = useMercadoStore((s) => s.error);

  const [tipModalVisible, setTipModalVisible] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  // Una clave por intencion de propina: los reintentos no duplican el cargo.
  const [claveIdempotencia, setClaveIdempotencia] = useState(nuevaClaveIdempotencia);

  useEffect(() => {
    if (loteId) void cargarPanel(loteId);
  }, [loteId, cargarPanel]);

  // Solo el comprador de la venta puede dar propina (ADR-10).
  const puedeDarPropina = rol === 'comprador';

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const surfaceContainerHigh = useThemeColor('surfaceContainerHigh');
  const primary = useThemeColor('primary');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');
  const tertiary = useThemeColor('tertiary');
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');
  const outlineVariant = useThemeColor('outlineVariant');
  const onPrimary = useThemeColor('onPrimary');
  const background = useThemeColor('background');

  const handleConfirmTip = useCallback(async () => {
    const amount = parseFloat(tipAmount.replace(',', '.'));
    if (Number.isNaN(amount) || amount <= 0 || !lote) return;
    try {
      await enviarPropina(lote.lote_id, amount, claveIdempotencia);
      setTipAmount('');
      setTipModalVisible(false);
      // Nueva clave: la siguiente propina es otra intencion.
      setClaveIdempotencia(nuevaClaveIdempotencia());
    } catch (err) {
      // El store ya expone el mensaje; aqui solo se evita cerrar el formulario.
      if (!(err instanceof ApiError)) throw err;
    }
  }, [tipAmount, lote, enviarPropina, claveIdempotencia]);

  if (!lote) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="arrow_back" size={24} color={onSurface} />
          </Pressable>
        </View>
        <EmptyState title="Lote no encontrado" description="El lote seleccionado no existe o ya no está disponible." iconName="error" />
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <IconSymbol name="arrow_back" size={24} color={onSurface} />
            </Pressable>
          </View>

          {/* Hero Section */}
          <View style={[styles.heroCard, { backgroundColor: surfaceContainerLow }]}>
            <View style={[styles.avatar, { backgroundColor: surfaceContainerHigh }]}>
              <IconSymbol name="person" size={32} color={onSurfaceVariant} />
            </View>
            <Text style={[typeScale.titleLarge, { color: onSurface, textAlign: 'center' }]}>
              {lote.productor_nombre}
            </Text>
            <Text style={[typeScale.bodySmall, { color: onSurfaceVariant, textAlign: 'center', marginBottom: spacing.sm }]}>
              {lote.finca_nombre}{lote.finca_municipio ? `, ${lote.finca_municipio}` : ''}
            </Text>
          </View>

          {/* Donut Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[typeScale.labelLarge, { color: onSurface }]}>COMERCIO JUSTO</Text>
              <View style={[styles.pill, { backgroundColor: primaryContainer }]}>
                <Text style={[typeScale.labelMedium, { color: onPrimaryContainer }]}>97% PRODUCTOR</Text>
              </View>
            </View>

            <View style={styles.donutContainer}>
              <DonutChart percentage={97} size={180} strokeWidth={18} />
            </View>

            <View style={styles.legend}>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: primary }]} />
                <Text style={[typeScale.bodyMedium, { color: onSurface, flex: 1 }]}>Productor (97%)</Text>
                <Text style={[typeScale.labelLarge, { color: onSurface }]}>${lote.monto_productor.toFixed(2)}</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: outlineVariant }]} />
                <Text style={[typeScale.bodyMedium, { color: onSurface, flex: 1 }]}>Plataforma (3%)</Text>
                <Text style={[typeScale.labelLarge, { color: onSurface }]}>${lote.monto_plataforma.toFixed(2)}</Text>
              </View>
            </View>
            <Text style={[typeScale.bodySmall, { color: onSurfaceVariant, textAlign: 'center', marginTop: spacing.md }]}>
              Garantizamos que el precio pagado llegue directamente a las manos del productor, promoviendo la sostenibilidad del cultivo.
            </Text>
          </View>

          {/* Tip Section */}
          <View style={[styles.tipCard, { backgroundColor: tertiaryContainer }]}>
            <Text style={[typeScale.labelLarge, { color: onTertiaryContainer, textAlign: 'center' }]}>
              PROPINA DIRECTA
            </Text>
            <Text style={[typeScale.bodySmall, { color: onTertiaryContainer, textAlign: 'center', marginBottom: spacing.md }]}>
              100% al productor
            </Text>

            {!puedeDarPropina ? (
              <Text
                style={[
                  typeScale.bodySmall,
                  { color: onTertiaryContainer, textAlign: 'center' },
                ]}
              >
                Solo el comprador de la venta puede dejar propina.
              </Text>
            ) : !tipModalVisible ? (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.tipButton,
                    { backgroundColor: tertiary },
                    { opacity: pressed ? 0.85 : 1 }
                  ]}
                  onPress={() => setTipModalVisible(true)}
                >
                  <Text style={[typeScale.labelLarge, { color: onPrimary }]}>Enviar Propina al Productor</Text>
                </Pressable>
                <View style={styles.secureContainer}>
                  <IconSymbol name="lock" size={16} color={onTertiaryContainer} />
                  <Text style={[typeScale.bodySmall, { color: onTertiaryContainer }]}>
                    Entorno de prueba: el pago es simulado
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.tipModal}>
                <TextInput
                  style={[
                    styles.tipInput,
                    typeScale.headlineMedium,
                    { color: onSurface, backgroundColor: surfaceContainerLow, borderColor: outlineVariant }
                  ]}
                  placeholder="0.00"
                  placeholderTextColor={onSurfaceVariant}
                  keyboardType="numeric"
                  value={tipAmount}
                  onChangeText={setTipAmount}
                  autoFocus
                />
                {errorStore ? (
                  <Text
                    style={[typeScale.bodySmall, { color: onSurface }, styles.errorTexto]}
                    accessibilityLiveRegion="polite"
                  >
                    {errorStore}
                  </Text>
                ) : null}
                <PrimaryButton
                  label="Confirmar"
                  loadingLabel="Enviando..."
                  loading={enviando}
                  onPress={handleConfirmTip}
                  style={{ marginTop: spacing.md }}
                />
                <Pressable
                  style={styles.cancelLink}
                  onPress={() => {
                    setTipModalVisible(false);
                    setTipAmount('');
                  }}
                >
                  <Text style={[typeScale.labelLarge, { color: onTertiaryContainer, textAlign: 'center' }]}>
                    Cancelar
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Propinas History */}
          <View style={styles.section}>
            <Text style={[typeScale.labelLarge, { color: onSurface, marginBottom: spacing.md }]}>
              HISTORIAL DE PROPINAS
            </Text>
            {lote.propinas.length > 0 ? (
              <View style={styles.historyList}>
                {lote.propinas.map((propina) => (
                  <View key={propina.id} style={[styles.historyItem, { backgroundColor: surfaceContainerLow }]}>
                    <View style={styles.historyItemMain}>
                      <Text style={[typeScale.titleMedium, { color: onSurface }]}>
                        ${propina.monto.toFixed(2)} {propina.moneda}
                      </Text>
                      <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
                        {new Date(propina.creado_en).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: propina.estado_propina === 'CONFIRMADA' ? primaryContainer : surfaceContainerHigh }]}>
                      <Text style={[typeScale.labelMedium, { color: propina.estado_propina === 'CONFIRMADA' ? onPrimaryContainer : onSurface }]}>
                        {propina.estado_propina}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
                Sin propinas registradas
              </Text>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  errorTexto: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  root: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  header: {
    paddingTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  heroCard: {
    padding: spacing.xl,
    borderRadius: radii.large,
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  donutContainer: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  legend: {
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: radii.full,
  },
  tipCard: {
    padding: spacing.xl,
    borderRadius: radii.large,
  },
  tipButton: {
    height: 48,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  secureContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  tipModal: {
    gap: spacing.md,
  },
  tipInput: {
    height: 64,
    borderWidth: 1,
    borderRadius: radii.medium,
    paddingHorizontal: spacing.lg,
    textAlign: 'center',
  },
  cancelLink: {
    minHeight: 48,
    justifyContent: 'center',
  },
  historyList: {
    gap: spacing.sm,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radii.medium,
    justifyContent: 'space-between',
  },
  historyItemMain: {
    gap: spacing.xs,
  }
});
