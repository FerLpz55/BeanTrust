/**
 * Panel de Comercio Justo (F04).
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { DonutChart } from '@/src/components/donut-chart';
import { PrimaryButton } from '@/src/components/primary-button';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useMercadoStore } from '@/src/store/mercado';
import { spacing, typeScale, radii } from '@/src/theme/tokens';
import { EmptyState } from '@/src/components/empty-state';

export default function LoteComercioJustoScreen() {
  const { loteId } = useLocalSearchParams<{ loteId: string }>();
  const { lotes, enviarPropina } = useMercadoStore();
  const lote = lotes.find((l) => l.lote_id === loteId);

  const [tipModalVisible, setTipModalVisible] = useState(false);
  const [tipAmount, setTipAmount] = useState('');

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

  const handleConfirmTip = () => {
    const amount = parseFloat(tipAmount);
    if (!isNaN(amount) && amount > 0) {
      enviarPropina(lote.lote_id, amount);
      setTipAmount('');
      setTipModalVisible(false);
    }
  };

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
              {lote.finca_nombre}, {lote.finca_municipio}
            </Text>
            {lote.testimonio && (
              <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant, fontStyle: 'italic', textAlign: 'center' }]}>
                &quot;{lote.testimonio}&quot;
              </Text>
            )}
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
                <Text style={[typeScale.labelLarge, { color: onSurface }]}>${lote.precio_productor.toFixed(2)}</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: outlineVariant }]} />
                <Text style={[typeScale.bodyMedium, { color: onSurface, flex: 1 }]}>Plataforma (3%)</Text>
                <Text style={[typeScale.labelLarge, { color: onSurface }]}>${lote.precio_plataforma.toFixed(2)}</Text>
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

            {!tipModalVisible ? (
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
                    Transacción segura e inmutable
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
                <PrimaryButton 
                  label="Confirmar" 
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
                        {new Date(propina.fecha).toLocaleDateString()} · {propina.comprador_nombre}
                      </Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: propina.estado === 'CONFIRMADA' ? primaryContainer : surfaceContainerHigh }]}>
                      <Text style={[typeScale.labelMedium, { color: propina.estado === 'CONFIRMADA' ? onPrimaryContainer : onSurface }]}>
                        {propina.estado}
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
