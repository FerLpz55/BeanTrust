/** Trazabilidad — Lista de lotes con timeline hash (F05). */

import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/src/components/empty-state';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { LoteCard } from '@/src/components/lote-card';
import { OfflineBanner } from '@/src/components/offline-banner';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useLotesStore } from '@/src/store/lotes';
import { useSyncStore } from '@/src/store/sync';
import { spacing, typeScale } from '@/src/theme/tokens';
import { router, type Href } from 'expo-router';
import { useCallback } from 'react';

export default function TrazabilidadScreen() {
  const { lotes, isLoading } = useLotesStore();
  const { pendingCount } = useSyncStore();

  const handleLotePress = useCallback((id: string) => {
    router.push(`/lotes/${id}` as Href);
  }, []);

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <View style={styles.loadingContent}>
          <IconSymbol size={48} name="account_tree" color={primary} />
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
            <IconSymbol size={32} name="account_tree" color={primary} />
            <View style={styles.headerText}>
              <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>TRAZABILIDAD</Text>
              <Text style={[typeScale.headlineMedium, { color: onSurface }]}>Tus lotes</Text>
            </View>
          </View>
        </View>

        {/* Filtros rápidos */}
        <View style={styles.filters}>
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>FILTRAR POR ESTADO</Text>
          <View style={styles.filterChips}>
            {['TODOS', 'CEREZA', 'PERGAMINO', 'ORO', 'TOSTADO', 'VENDIDO', 'RECHAZADO'].map(estado => (
              <Text
                key={estado}
                style={[
                  styles.filterChip,
                  estado === 'TODOS' && styles.filterChipActive,
                  { backgroundColor: estado === 'TODOS' ? primary : surfaceContainerLow },
                ]}
              >
                {estado}
              </Text>
            ))}
          </View>
        </View>

        {/* Lista de lotes */}
        {lotes.length === 0 ? (
          <EmptyState
            title="Sin lotes registrados"
            description="Registra tu primera cosecha para comenzar la trazabilidad"
            iconName="agriculture"
            actionLabel="Nueva cosecha"
            onAction={() => router.push('/lotes/nuevo' as Href)}
          />
        ) : (
          <View style={styles.lotesList}>
            {lotes.map(lote => (
              <LoteCard
                key={lote.id}
                lote={lote}
                onPressId={handleLotePress}
              />
            ))}
          </View>
        )}
      </ScrollView>
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
  filters: {
    gap: spacing.sm,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.full,
  },
  filterChipActive: {
    // color handled inline
  },
  lotesList: {
    gap: spacing.md,
  },
});