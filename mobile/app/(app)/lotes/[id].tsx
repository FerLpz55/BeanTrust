/** Detalle de Lote — placeholder (F05). */

import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useLotesStore } from '@/src/store/lotes';
import { spacing, typeScale } from '@/src/theme/tokens';
import { useLocalSearchParams } from 'expo-router';

export default function LoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lote = useLotesStore((s) => s.lotes.find((l) => l.id === id));

  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');

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
          <IconSymbol size={32} name="local_cafe" color={primary} />
          <View style={styles.headerText}>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>{lote.codigo}</Text>
            <Text style={[typeScale.headlineMedium, { color: onSurface }]}>{lote.variedad}</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: surfaceContainerLow }]}>
          <Row label="Método" value={lote.metodo} />
          <Row label="Estado" value={lote.estado} />
          <Row label="Peso" value={`${lote.peso_actual_kg.toFixed(1)} kg`} />
          <Row label="Hash" value={lote.hash_etapa} />
          <Row label="Certificado" value={lote.certificado ? 'Sí' : 'No'} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  return (
    <View style={styles.row}>
      <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>{label}</Text>
      <Text style={[typeScale.bodyMedium, { color: onSurface }]}>{value}</Text>
    </View>
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
    gap: spacing.xs,
  },
  card: {
    padding: spacing.lg,
    borderRadius: 16,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
