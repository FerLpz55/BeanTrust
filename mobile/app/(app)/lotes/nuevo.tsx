/** Wizard Registro de Lote — placeholder (F02). */

import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/src/components/primary-button';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { useLotesStore } from '@/src/store/lotes';
import { spacing, typeScale } from '@/src/theme/tokens';
import { router } from 'expo-router';

export default function NuevoLoteScreen() {
  const addLote = useLotesStore((s) => s.addLote);
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');

  const handleCrear = () => {
    addLote({
      variedad: 'Geisha',
      metodo: 'Lavado',
      evidencia: [],
      estado: 'CEREZA',
      peso_actual_kg: 100,
      fecha_cosecha: new Date().toISOString(),
      certificado: false,
    });
    router.back();
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <IconSymbol size={32} name="add_circle" color={primary} />
          <View style={styles.headerText}>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>NUEVA COSECHA</Text>
            <Text style={[typeScale.headlineMedium, { color: onSurface }]}>Registrar lote</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={[typeScale.bodyLarge, { color: onSurface }]}>
            Wizard de 3 pasos (F02):
          </Text>
          <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }]}>
            1. Variedad + Método{'\n'}
            2. Peso{'\n'}
            3. Evidencia fotográfica
          </Text>
        </View>

        <PrimaryButton label="Crear lote de prueba" onPress={handleCrear} />
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
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 16,
  },
});
