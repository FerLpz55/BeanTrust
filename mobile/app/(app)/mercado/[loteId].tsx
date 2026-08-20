/** Detalle de venta de lote — placeholder. */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useLotesStore } from '@/src/store/lotes';
import { spacing, typeScale } from '@/src/theme/tokens';
import { useLocalSearchParams } from 'expo-router';

export default function MercadoLoteDetailScreen() {
  const { loteId } = useLocalSearchParams<{ loteId: string }>();
  const lote = useLotesStore((s) => s.lotes.find((l) => l.id === loteId));

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const tertiary = useThemeColor('tertiary');
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const onTertiaryContainer = useThemeColor('onTertiaryContainer');

  if (!lote) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={[typeScale.bodyLarge, { color: onSurfaceVariant }]}>Lote no encontrado</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <IconSymbol size={32} name="storefront" color={tertiary} />
          <View style={styles.headerText}>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>VENTA</Text>
            <Text style={[typeScale.headlineMedium, { color: onSurface }]} numberOfLines={1} ellipsizeMode="tail">
              {lote.variedad}
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: tertiaryContainer }]}>
          <Text style={[typeScale.bodyLarge, { color: onTertiaryContainer }]}>
            Panel de venta para {lote.codigo}
          </Text>
          <Text style={[typeScale.bodyMedium, { color: onTertiaryContainer }]}>
            Peso: {lote.peso_actual_kg.toFixed(1)} kg{'\n'}
            Estado: {lote.estado}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  card: {
    padding: spacing.lg,
    borderRadius: 16,
    gap: spacing.sm,
  },
});
