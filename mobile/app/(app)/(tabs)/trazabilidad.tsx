/** Trazabilidad — Lista de lotes con timeline hash (F05). */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/src/components/empty-state';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { LoteCard } from '@/src/components/lote-card';
import { OfflineBanner } from '@/src/components/offline-banner';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useLotesStore, type LoteEstado } from '@/src/store/lotes';
import { useSyncStore } from '@/src/store/sync';
import { spacing, typeScale } from '@/src/theme/tokens';
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';

type Filtro = 'TODOS' | LoteEstado;

const ESTADOS: Filtro[] = ['TODOS', 'CEREZA', 'PERGAMINO', 'ORO', 'TOSTADO', 'VENDIDO', 'RECHAZADO'];

export default function TrazabilidadScreen() {
  const { lotes, isLoading } = useLotesStore();
  const { pendingCount } = useSyncStore();
  const [filtro, setFiltro] = useState<Filtro>('TODOS');

  const handleLotePress = useCallback((id: string) => {
    router.push(`/lotes/${id}` as Href);
  }, []);

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const onPrimary = useThemeColor('onPrimary');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const outlineVariant = useThemeColor('outlineVariant');

  const lotesFiltrados = filtro === 'TODOS' ? lotes : lotes.filter((l) => l.estado === filtro);

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
            {ESTADOS.map((estado) => {
              const activo = estado === filtro;
              return (
                <Pressable
                  key={estado}
                  onPress={() => setFiltro(estado)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activo }}
                  style={({ pressed }) => [
                    styles.filterChip,
                    {
                      backgroundColor: activo ? primary : surfaceContainerLow,
                      borderColor: activo ? primary : outlineVariant,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[typeScale.labelMedium, { color: activo ? onPrimary : onSurfaceVariant }]}
                  >
                    {estado}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Lista de lotes */}
        {lotesFiltrados.length === 0 ? (
          <EmptyState
            title={filtro === 'TODOS' ? 'Sin lotes registrados' : 'Sin lotes en este estado'}
            description={
              filtro === 'TODOS'
                ? 'Registra tu primera cosecha para comenzar la trazabilidad'
                : 'Prueba con otro filtro o registra una nueva cosecha'
            }
            iconName="agriculture"
            actionLabel="Nueva cosecha"
            onAction={() => router.push('/lotes/nuevo' as Href)}
          />
        ) : (
          <View style={styles.lotesList}>
            {lotesFiltrados.map(lote => (
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
    borderWidth: 1,
  },
  lotesList: {
    gap: spacing.md,
  },
});