/**
 * Mercado — Saldo y lotes vendidos (F04).
 */

import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { EmptyState } from '@/src/components/empty-state';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useMercadoStore } from '@/src/store/mercado';
import { spacing, typeScale, radii } from '@/src/theme/tokens';
import { useCallback } from 'react';

export default function MercadoScreen() {
  const { lotes, saldo } = useMercadoStore();
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const tertiary = useThemeColor('tertiary');
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');
  const surfaceContainer = useThemeColor('surfaceContainer');

  const handlePressLote = useCallback((loteId: string) => {
    Haptics.selectionAsync();
    router.push(`/mercado/${loteId}` as Href);
  }, []);

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
            ${saldo.toFixed(2)}
          </Text>
          <View style={styles.saldoActions}>
            <View style={[styles.actionChip, { backgroundColor: tertiary }]}>
              <Text style={[typeScale.labelMedium, { color: '#F8EBDC' }]}>Retirar</Text>
            </View>
            <View style={[styles.actionChip, { backgroundColor: tertiary }]}>
              <Text style={[typeScale.labelMedium, { color: '#F8EBDC' }]}>Historial</Text>
            </View>
          </View>
        </View>

        {/* Lotes vendidos */}
        <View style={styles.sectionHeader}>
          <Text style={[typeScale.labelLarge, { color: onSurface }]}>LOTES VENDIDOS</Text>
        </View>

        {lotes.length === 0 ? (
          <EmptyState
            title="Sin lotes vendidos"
            description="Tus lotes vendidos aparecerán aquí"
            iconName="storefront"
          />
        ) : (
          <View style={styles.list}>
            {lotes.map((lote) => (
              <Pressable
                key={lote.lote_id}
                style={({ pressed }) => [
                  styles.item,
                  { backgroundColor: surfaceContainer },
                  { opacity: pressed ? 0.85 : 1 }
                ]}
                onPress={() => handlePressLote(lote.lote_id)}
              >
                <View style={styles.itemText}>
                  <Text style={[typeScale.titleMedium, { color: onSurface }]} numberOfLines={1} ellipsizeMode="tail">
                    {lote.variedad}
                  </Text>
                  <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]} numberOfLines={1}>
                    {lote.metodo} · {lote.peso_kg.toFixed(1)} kg
                  </Text>
                </View>
                <IconSymbol size={24} name="chevron_right" color={onSurfaceVariant} />
              </Pressable>
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
    borderRadius: radii.large,
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
    borderRadius: radii.full,
    minHeight: 48,
    justifyContent: 'center',
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
    padding: spacing.lg,
    borderRadius: radii.medium,
    minHeight: 64,
  },
  itemText: {
    flex: 1,
    marginRight: spacing.sm,
    gap: spacing.xs,
  },
});
