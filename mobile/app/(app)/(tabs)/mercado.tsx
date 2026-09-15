/**
 * Mercado — Saldo del productor y lotes vendidos (F04/F13).
 *
 * Gating por rol (matriz §10):
 * - **productor**: ve su saldo real (`GET /v1/pagos/saldo`) y sus lotes vendidos.
 * - **cooperativa/admin**: ven los lotes vendidos; el saldo es del productor.
 * - **comprador**: no puede listar lotes (`LoteService.listar` lo rechaza; el
 *   comprador llega al lote escaneando su QR, §8), así que se le indica esa ruta.
 *
 * El dinero es simulado por el gateway fake: web3 sigue en pausa (B7).
 */

import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';

import { EmptyState } from '@/src/components/empty-state';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useLotes } from '@/src/hooks/use-lotes';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useAuthStore } from '@/src/store/auth';
import { useMercadoStore } from '@/src/store/mercado';
import { type Lote } from '@/src/store/lotes';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

/** Data estable para la lista vacía del comprador (evita recrear el array). */
const SIN_LOTES: Lote[] = [];

export default function MercadoScreen() {
  const rol = useAuthStore((s) => s.rol);
  const saldo = useMercadoStore((s) => s.saldo);
  const cargarSaldo = useMercadoStore((s) => s.cargarSaldo);
  const { lotes, refrescar, refrescando } = useLotes();

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const tertiary = useThemeColor('tertiary');
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');
  const surfaceContainer = useThemeColor('surfaceContainer');

  const esComprador = rol === 'comprador';

  useEffect(() => {
    if (rol === 'productor' || rol === 'admin') void cargarSaldo();
  }, [rol, cargarSaldo]);

  const vendidos = useMemo(() => lotes.filter((l) => l.estado === 'VENDIDO'), [lotes]);

  const handlePressLote = useCallback((loteId: string) => {
    Haptics.selectionAsync();
    router.push(`/mercado/${loteId}` as Href);
  }, []);

  const renderLote = useCallback(
    ({ item }: { item: Lote }) => (
      <Pressable
        style={({ pressed }) => [
          styles.item,
          { backgroundColor: surfaceContainer },
          { opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => handlePressLote(item.id)}
      >
        <View style={styles.itemText}>
          <Text
            style={[typeScale.titleMedium, { color: onSurface }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.variedad}
          </Text>
          <Text
            style={[typeScale.bodySmall, { color: onSurfaceVariant }]}
            numberOfLines={1}
          >
            {item.metodo} · {item.peso_actual_kg.toFixed(1)} kg
          </Text>
        </View>
        <IconSymbol size={24} name="chevron-right" color={onSurfaceVariant} />
      </Pressable>
    ),
    [handlePressLote, surfaceContainer, onSurface, onSurfaceVariant]
  );
  const keyExtractor = useCallback((lote: Lote) => lote.id, []);

  const listHeader = (
    <View style={styles.headerBlock}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconSymbol size={32} name="storefront" color={tertiary} />
          <View style={styles.headerText}>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>MERCADO</Text>
            <Text style={[typeScale.headlineMedium, { color: onSurface }]}>
              {saldo ? 'Tu saldo' : 'Comercio justo'}
            </Text>
          </View>
        </View>
      </View>

      {saldo ? (
        <View style={[styles.saldoCard, { backgroundColor: tertiaryContainer }]}>
          <Text style={[typeScale.eyebrow, { color: onTertiaryContainer }]}>
            SALDO CONFIRMADO
          </Text>
          <Text
            style={[
              typeScale.headlineMedium,
              { color: onTertiaryContainer },
              styles.saldoValue,
            ]}
          >
            ${saldo.saldo_total.toFixed(2)} {saldo.moneda}
          </Text>
          <View style={styles.desglose}>
            <Text style={[typeScale.bodySmall, { color: onTertiaryContainer }]}>
              Ventas (97%): ${saldo.total_pagos.toFixed(2)}
            </Text>
            <Text style={[typeScale.bodySmall, { color: onTertiaryContainer }]}>
              Propinas (100%): ${saldo.total_propinas.toFixed(2)}
            </Text>
          </View>
        </View>
      ) : null}

      {esComprador ? null : (
        <View style={styles.sectionHeader}>
          <Text style={[typeScale.labelLarge, { color: onSurface }]}>LOTES VENDIDOS</Text>
        </View>
      )}
    </View>
  );

  const listEmpty = esComprador ? (
    <EmptyState
      title="Escanea para ver el comercio justo"
      description="Como comprador llegas al panel 97/3 de un lote escaneando el QR de su Pasaporte de Café."
      iconName="qr-code-scanner"
      actionLabel="Abrir escáner"
      onAction={() => router.push('/verificar' as Href)}
    />
  ) : (
    <EmptyState
      title="Sin lotes vendidos"
      description="Tus lotes vendidos aparecerán aquí"
      iconName="storefront"
    />
  );

  return (
    <SafeAreaView style={styles.root}>
      <FlashList
        data={esComprador ? SIN_LOTES : vendidos}
        renderItem={renderLote}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={LoteVendidoSeparator}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={() => {
              void refrescar();
              void cargarSaldo();
            }}
          />
        }
      />
    </SafeAreaView>
  );
}

/** Separación entre lotes vendidos (antes `gap` del contenedor). */
function LoteVendidoSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
  saldoCard: {
    padding: spacing.xl,
    borderRadius: radii.large,
    gap: spacing.md,
  },
  saldoValue: {
    fontSize: 36,
    lineHeight: 44,
  },
  desglose: {
    gap: spacing.xs,
  },
  sectionHeader: {
    paddingTop: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderRadius: radii.medium,
    gap: spacing.md,
  },
  itemText: {
    flex: 1,
    gap: spacing.xs,
  },
});
