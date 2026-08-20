/** Mercado — Saldo y lotes listos para venta (placeholder F04). */

import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/src/components/empty-state';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useLotesStore } from '@/src/store/lotes';
import { spacing, typeScale } from '@/src/theme/tokens';
import { router } from 'expo-router';

export default function MercadoScreen() {
  const { lotes } = useLotesStore();
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const tertiary = useThemeColor('tertiary');
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');

  const lotesVenta = lotes.filter((l) => l.certificado && l.estado !== 'VENDIDO');

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <IconSymbol size={32} name="storefront" color={tertiary} />
            <View style={styles.headerText}>
              <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>MERCADO</Text>
              <Text style={[typeScale.headlineMedium, { color: onSurface }]}>Tu saldo</Text>
            </View>
          </View>
        </View>

        {/* Card de saldo */}
        <View style={[styles.saldoCard, { backgroundColor: tertiaryContainer }]}>
          <Text style={[typeScale.eyebrow, { color: onTertiaryContainer }]}>SALDO DISPONIBLE</Text>
          <Text style={[typeScale.headlineMedium, { color: onTertiaryContainer }, styles.saldoValue]}>
            $420.00
          </Text>
          <View style={styles.saldoActions}>
            <View style={[styles.actionChip, { backgroundColor: tertiary }]}>
              <Text style={[typeScale.labelMedium, { color: '#fff' }]}>Retirar</Text>
            </View>
            <View style={[styles.actionChip, { backgroundColor: tertiary }]}>
              <Text style={[typeScale.labelMedium, { color: '#fff' }]}>Historial</Text>
            </View>
          </View>
        </View>

        {/* Lotes en venta */}
        <View style={styles.sectionHeader}>
          <Text style={[typeScale.labelLarge, { color: onSurface }]}>LOTES EN VENTA</Text>
        </View>

        {lotesVenta.length === 0 ? (
          <EmptyState
            title="Sin lotes en mercado"
            description="Certifica y sube lotes para ponerlos a la venta"
            iconName="storefront"
          />
        ) : (
          <View style={styles.list}>
            {lotesVenta.map((lote) => (
              <View key={lote.id} style={[styles.item, { backgroundColor: tertiaryContainer }]}>
                <View>
                  <Text style={[typeScale.titleLarge, { color: onTertiaryContainer }]}>{lote.variedad}</Text>
                  <Text style={[typeScale.bodySmall, { color: onTertiaryContainer }]}>
                    {lote.metodo} · {lote.peso_actual_kg.toFixed(1)} kg
                  </Text>
                </View>
                <IconSymbol size={20} name="chevron_right" color={onTertiaryContainer} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    gap: spacing.xs,
  },
  saldoCard: {
    padding: spacing.xl,
    borderRadius: 16,
    gap: spacing.md,
  },
  saldoValue: {
    fontSize: 36,
    lineHeight: 44,
  },
  saldoActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.full,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: {
    gap: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: 12,
  },
});
