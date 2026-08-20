/** Dashboard Mi Finca — bento grid (F01). */

import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '@/src/components/brand-mark';
import { FAB } from '@/src/components/fab';
import { MetricCard } from '@/src/components/metric-card';
import { OfflineBanner } from '@/src/components/offline-banner';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useLotesStore } from '@/src/store/lotes';
import { useSyncStore } from '@/src/store/sync';
import { spacing, typeScale } from '@/src/theme/tokens';
import { router, type Href } from 'expo-router';

export default function DashboardScreen() {
  const { lotes, isLoading } = useLotesStore();
  const { pendingCount } = useSyncStore();

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const tertiary = useThemeColor('tertiary');
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');

  // Métricas calculadas
  const totalLotes = lotes.length;
  const lotesActivos = lotes.filter(l => l.estado !== 'VENDIDO' && l.estado !== 'RECHAZADO').length;
  const pesoTotalKg = lotes.reduce((sum, l) => sum + l.peso_actual_kg, 0);
  const certificados = lotes.filter(l => l.certificado).length;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <View style={styles.loadingContent}>
          <BrandMark size={48} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <OfflineBanner pendingCount={pendingCount} onRetry={() => {}} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <BrandMark size={40} />
            <View style={styles.headerText}>
              <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>MI FINCA</Text>
              <Text style={[typeScale.headlineMedium, { color: onSurface }]}>Bean Trust</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={[typeScale.dataMono, { color: primary, backgroundColor: primaryContainer }, styles.syncBadge]}>
              {pendingCount > 0 ? `${pendingCount} pendiente${pendingCount > 1 ? 's' : ''}` : 'Sincronizado'}
            </Text>
          </View>
        </View>

        {/* Bento Grid: 2x2 métricas principales */}
        <View style={styles.bentoGrid}>
          <MetricCard
            iconName="local_cafe"
            iconColor={primary}
            label="LOTES ACTIVOS"
            value={String(lotesActivos)}
            sublabel={`de ${totalLotes} totales`}
            onPress={() => router.push('/trazabilidad' as Href)}
          />
          <MetricCard
            iconName="account_balance_wallet"
            iconColor={tertiary}
            label="PESO TOTAL"
            value={`${pesoTotalKg.toFixed(1)} kg`}
            sublabel="En proceso"
            onPress={() => router.push('/trazabilidad' as Href)}
          />
          <MetricCard
            iconName="verified_user"
            iconColor={primary}
            label="CERTIFICADOS"
            value={String(certificados)}
            sublabel="Listos para venta"
            onPress={() => router.push('/mercado' as Href)}
          />
          <MetricCard
            iconName="storefront"
            iconColor={tertiary}
            label="EN MERCADO"
            value={String(lotes.filter(l => l.estado === 'TOSTADO').length)}
            sublabel="Esperando comprador"
            onPress={() => router.push('/mercado' as Href)}
          />
        </View>

        {/* Lotes recientes */}
        <View style={styles.sectionHeader}>
          <Text style={[typeScale.labelLarge, { color: onSurface }]}>LOTES RECIENTES</Text>
          <Text
            style={[typeScale.labelMedium, { color: primary }]}
            onPress={() => router.push('/trazabilidad' as Href)}
          >
            Ver todos
          </Text>
        </View>

        {lotes.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol size={48} name="agriculture" color={onSurfaceVariant} />
            <Text style={[typeScale.bodyLarge, { color: onSurface }, styles.emptyTitle]}>
              Sin lotes registrados
            </Text>
            <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }, styles.emptySubtitle]}>
              Tu primera cosecha está a un toque
            </Text>
          </View>
        ) : (
          <View style={styles.lotesList}>
            {lotes.slice(0, 3).map(lote => (
              <View key={lote.id} style={[styles.loteCard, { backgroundColor: surfaceContainerLow }]}>
                <View style={styles.loteCardLeft}>
                  <Text style={[typeScale.titleMedium, { color: onSurface }]}>{lote.variedad ?? 'Sin variedad'}</Text>
                  <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
                    {new Date(lote.fecha_cosecha).toLocaleDateString('es-ES')}
                  </Text>
                </View>
                <View style={styles.loteCardRight}>
                  <Text style={[typeScale.dataMono, { color: onSurface }]}>{lote.peso_actual_kg.toFixed(1)} kg</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <FAB
        iconName="add"
        onPress={() => router.push('/lotes/nuevo' as Href)}
        accessibilityLabel="Nueva cosecha"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl + 80, // espacio para FAB
    gap: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerRight: {
    alignItems: 'flex-end',
  },
  syncBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.full,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
  },
  lotesList: {
    gap: spacing.md,
  },
  loteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: 12,
  },
  loteCardLeft: {
    gap: spacing.xs,
  },
  loteCardRight: {
    alignItems: 'flex-end',
  },
});