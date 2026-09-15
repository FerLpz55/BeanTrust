/** Trazabilidad — Lista de lotes con timeline hash (F05). */

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';

import { EmptyState } from '@/src/components/empty-state';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { LoteCard } from '@/src/components/lote-card';
import { OfflineBanner } from '@/src/components/offline-banner';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useLotes } from '@/src/hooks/use-lotes';
import { useAuthStore } from '@/src/store/auth';
import { type Lote, type LoteEstado } from '@/src/store/lotes';
import { useSyncStore } from '@/src/store/sync';
import { spacing, typeScale } from '@/src/theme/tokens';
import { Redirect, router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';

type Filtro = 'TODOS' | LoteEstado;

const ESTADOS: Filtro[] = ['TODOS', 'CEREZA', 'PERGAMINO', 'ORO', 'TOSTADO', 'VENDIDO', 'RECHAZADO'];

export default function TrazabilidadScreen() {
  const rol = useAuthStore((s) => s.rol);
  const { lotes, isLoading, error, refrescar, refrescando, hayMas, cargarMas, isLoadingMore } =
    useLotes();
  const { pendingCount, sincronizando, sincronizarAhora } = useSyncStore();
  const [filtro, setFiltro] = useState<Filtro>('TODOS');

  const handleLotePress = useCallback((id: string) => {
    router.push(`/lotes/${id}` as Href);
  }, []);

  const renderLote = useCallback(
    ({ item }: { item: Lote }) => <LoteCard lote={item} onPressId={handleLotePress} />,
    [handleLotePress]
  );
  const keyExtractor = useCallback((lote: Lote) => lote.id, []);

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const onPrimary = useThemeColor('onPrimary');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const outlineVariant = useThemeColor('outlineVariant');

  const lotesFiltrados = filtro === 'TODOS' ? lotes : lotes.filter((l) => l.estado === filtro);

  // El comprador no lista lotes (el backend lo rechaza, §10): llega a ellos
  // escaneando el QR desde Mercado. Se revisa después de todos los hooks.
  if (rol === 'comprador') {
    return <Redirect href="/mercado" />;
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <View style={styles.loadingContent}>
          <IconSymbol size={48} name="account-tree" color={primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Cabecera/pie/vacío como props de la FlashList para conservar el scroll
  // único de la pantalla y la paginación por cursor bajo demanda.
  const listHeader = (
    <View style={styles.headerBlock}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconSymbol size={32} name="account-tree" color={primary} />
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

      {error ? (
        <Text
          style={[typeScale.bodyMedium, { color: onSurfaceVariant }, styles.errorTexto]}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );

  const listEmpty = (
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
  );

  // Paginación por cursor (§6): se pide la siguiente página bajo demanda.
  const listFooter =
    lotesFiltrados.length > 0 && hayMas && filtro === 'TODOS' ? (
      isLoadingMore ? (
        <ActivityIndicator color={primary} style={styles.masIndicador} />
      ) : (
        <Pressable
          onPress={cargarMas}
          accessibilityRole="button"
          style={({ pressed }) => [styles.masBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[typeScale.labelLarge, { color: primary }]}>Cargar más lotes</Text>
        </Pressable>
      )
    ) : null;

  return (
    <SafeAreaView style={styles.root}>
      <OfflineBanner
        pendingCount={pendingCount}
        onRetry={() => void sincronizarAhora()}
        sincronizando={sincronizando}
      />

      <FlashList
        data={lotesFiltrados}
        renderItem={renderLote}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={LoteSeparator}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
      />
    </SafeAreaView>
  );
}

/** Separación entre tarjetas (antes `gap` del contenedor). */
function LoteSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  errorTexto: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  masBtn: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  masIndicador: {
    marginVertical: spacing.lg,
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
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  headerBlock: {
    gap: spacing.xl,
    marginBottom: spacing.xl,
  },
  separator: {
    height: spacing.md,
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
});