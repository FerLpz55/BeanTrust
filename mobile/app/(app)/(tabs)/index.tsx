/** Dashboard Mi Finca — fila de estadísticas + lotes recientes (F01). */

import * as Haptics from 'expo-haptics';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/src/components/brand-mark';
import { CherryIcon, ScaleIcon, SealIcon, StallIcon } from '@/src/components/icons/stat-icons';
import { OfflineBanner } from '@/src/components/offline-banner';
import { PrimaryButton } from '@/src/components/primary-button';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useLotes } from '@/src/hooks/use-lotes';
import { useAuthStore } from '@/src/store/auth';
import { type LoteEstado } from '@/src/store/lotes';
import { useSyncStore } from '@/src/store/sync';
import { radii, spacing, typeScale } from '@/src/theme/tokens';
import { Redirect, router, type Href } from 'expo-router';

function formatFechaRelativa(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 30) return `Hace ${dias} días`;
  return new Date(iso).toLocaleDateString('es-ES');
}

export default function DashboardScreen() {
  const rol = useAuthStore((s) => s.rol);
  const { lotes, isLoading, error: errorLotes, refrescar, refrescando } = useLotes();
  const { pendingCount } = useSyncStore();

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const surfaceContainerLowest = useThemeColor('surfaceContainerLowest');
  const outlineVariant = useThemeColor('outlineVariant');
  const secondary = useThemeColor('secondary');
  const tertiary = useThemeColor('tertiary');
  const error = useThemeColor('error');

  const colorPorEstado = (estado: LoteEstado): string => {
    switch (estado) {
      case 'CEREZA':
        return tertiary;
      case 'PERGAMINO':
      case 'ORO':
        return secondary;
      case 'TOSTADO':
        return primary;
      case 'RECHAZADO':
        return error;
      case 'VENDIDO':
      default:
        return onSurfaceVariant;
    }
  };

  // Métricas calculadas
  const lotesActivos = lotes.filter(l => l.estado !== 'VENDIDO' && l.estado !== 'RECHAZADO').length;
  const pesoTotalKg = lotes.reduce((sum, l) => sum + l.peso_actual_kg, 0);
  const certificados = lotes.filter(l => l.certificado).length;
  const enMercado = lotes.filter(l => l.estado === 'TOSTADO').length;

  const stats = [
    {
      key: 'activos',
      Icon: CherryIcon,
      color: primary,
      value: String(lotesActivos),
      label: 'LOTES ACTIVOS',
      onPress: () => router.push('/trazabilidad' as Href),
    },
    {
      key: 'peso',
      Icon: ScaleIcon,
      color: tertiary,
      value: `${pesoTotalKg.toFixed(1)} kg`,
      label: 'PESO TOTAL',
      onPress: () => router.push('/trazabilidad' as Href),
    },
    {
      key: 'certificados',
      Icon: SealIcon,
      color: primary,
      value: String(certificados),
      label: 'CERTIFICADOS',
      onPress: () => router.push('/mercado' as Href),
    },
    {
      key: 'mercado',
      Icon: StallIcon,
      color: tertiary,
      value: String(enMercado),
      label: 'EN MERCADO',
      onPress: () => router.push('/mercado' as Href),
    },
  ] as const;

  // El comprador no gestiona cosechas (§10): esta pantalla es de
  // productor/cooperativa/admin. Se le manda a Mercado, desde donde escanea.
  if (rol === 'comprador') {
    return <Redirect href="/mercado" />;
  }

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
      <OfflineBanner pendingCount={pendingCount} onRetry={refrescar} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
      >
        {errorLotes ? (
          <Text
            style={[typeScale.bodyMedium, { color: onSurfaceVariant }, styles.errorTexto]}
            accessibilityLiveRegion="polite"
          >
            {errorLotes}
          </Text>
        ) : null}
        {/* Header */}
        <View style={styles.header}>
          <BrandMark size={40} />
          <View style={styles.headerText}>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>MI FINCA</Text>
            <Text style={[typeScale.headlineMedium, { color: onSurface }]}>Bean Trust</Text>
            <View
              style={[
                styles.syncBadge,
                { backgroundColor: pendingCount > 0 ? primaryContainer : surfaceContainerLow },
              ]}
            >
              <View
                style={[
                  styles.syncDot,
                  { backgroundColor: pendingCount > 0 ? primary : onSurfaceVariant },
                ]}
              />
              <Text
                style={[
                  typeScale.dataMono,
                  { color: pendingCount > 0 ? onPrimaryContainer : onSurfaceVariant },
                ]}
              >
                {pendingCount > 0 ? `${pendingCount} pendiente${pendingCount > 1 ? 's' : ''}` : 'Sincronizado'}
              </Text>
            </View>
          </View>
        </View>

        {/* Estadísticas — agrupadas por tema: cosecha (2) y comercio (2) */}
        <View style={styles.statsGroups}>
          {[stats.slice(0, 2), stats.slice(2, 4)].map((grupo, i) => (
            <View key={i} style={styles.statsList}>
              {grupo.map((stat) => {
                const Icon = stat.Icon;
                return (
                  <Pressable
                    key={stat.key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      stat.onPress();
                    }}
                    style={({ pressed }) => [
                      styles.statRow,
                      { backgroundColor: surfaceContainerLow, opacity: pressed ? 0.9 : 1 },
                    ]}
                  >
                    <View style={[styles.statIconBadge, { backgroundColor: surfaceContainerLowest }]}>
                      <Icon size={20} color={onSurfaceVariant} />
                    </View>
                    <Text
                      style={[typeScale.labelMedium, styles.statRowLabel, { color: onSurfaceVariant }]}
                      numberOfLines={1}
                    >
                      {stat.label}
                    </Text>
                    <Text style={[typeScale.titleLarge, { color: stat.color }]} numberOfLines={1}>
                      {stat.value}
                    </Text>
                    <IconSymbol size={18} name="chevron-right" color={onSurfaceVariant} />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {/* Lotes recientes */}
        <View style={styles.sectionHeader}>
          <Text style={[typeScale.labelLarge, { color: onSurface }]}>LOTES RECIENTES</Text>
          <Pressable
            style={styles.verTodosRow}
            onPress={() => router.push('/trazabilidad' as Href)}
          >
            <Text style={[typeScale.labelMedium, { color: primary }]}>Ver todos</Text>
            <IconSymbol size={16} name="chevron-right" color={primary} />
          </Pressable>
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
              <Pressable
                key={lote.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push(`/lotes/${lote.id}` as Href);
                }}
                style={({ pressed }) => [
                  styles.loteCard,
                  { backgroundColor: surfaceContainerLow, opacity: pressed ? 0.9 : 1 },
                ]}
              >
                <View style={[styles.statIconBadge, { backgroundColor: surfaceContainerLowest }]}>
                  <IconSymbol size={18} name="local-cafe" color={onSurfaceVariant} />
                </View>
                <View style={styles.loteCardLeft}>
                  <View style={styles.loteCardTitleRow}>
                    <View style={[styles.statusDot, { backgroundColor: colorPorEstado(lote.estado) }]} />
                    <Text
                      style={[typeScale.titleMedium, styles.loteCardTitle, { color: onSurface }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {lote.variedad ?? 'Sin variedad'}
                    </Text>
                  </View>
                  <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
                    {formatFechaRelativa(lote.fecha_cosecha)}
                  </Text>
                </View>
                <Text style={[typeScale.dataMono, { color: onSurface }]} numberOfLines={1}>
                  {lote.peso_actual_kg.toFixed(1)} kg
                </Text>
                <IconSymbol size={18} name="chevron-right" color={onSurfaceVariant} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { borderTopColor: outlineVariant }]}>
        <PrimaryButton label="Nueva cosecha" onPress={() => router.push('/lotes/nuevo' as Href)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  errorTexto: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: spacing.full,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statsGroups: {
    gap: spacing.md,
  },
  statsList: {
    gap: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.large,
    borderCurve: 'continuous',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  statIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRowLabel: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verTodosRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.large,
    borderCurve: 'continuous',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  loteCardLeft: {
    flex: 1,
    gap: 2,
  },
  loteCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  loteCardTitle: {
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bottomBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});