/** Escáner QR mock (F03) — público, sin auth. */

import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '@/src/components/brand-mark';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale } from '@/src/theme/tokens';

export default function VerificarScreen() {
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const primaryContainer = useThemeColor('primaryContainer');
  const onPrimaryContainer = useThemeColor('onPrimaryContainer');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <BrandMark size={40} />
        <View style={styles.headerText}>
          <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>VERIFICACIÓN PÚBLICA</Text>
          <Text style={[typeScale.headlineMedium, { color: onSurface }]}>Pasaporte de Café</Text>
        </View>
      </View>

      <View style={styles.scannerWrapper}>
        <View style={styles.scannerFrame}>
          <View style={styles.corners}>
            <View style={styles.corner} />
            <View style={styles.corner} />
            <View style={styles.corner} />
            <View style={styles.corner} />
          </View>
          <View style={styles.scannerContent}>
            <IconSymbol size={64} name="photo_camera" color={onSurfaceVariant} />
            <Text style={[typeScale.bodyLarge, { color: onSurfaceVariant }, styles.scannerText]}>
              Apunta al código QR del lote
            </Text>
            <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.scannerHint]}>
              Formato: BTR-XXXX-XXXX
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.demoSection}>
        <Text style={[typeScale.labelMedium, { color: onSurfaceVariant }, styles.demoTitle]}>
          Probar con lote demo
        </Text>
        <View style={styles.demoButtons}>
          <Pressable style={({ pressed }) => [styles.demoButton, { backgroundColor: primaryContainer, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={[typeScale.labelLarge, { color: onPrimaryContainer }]}>BTR-2024-0042</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.demoButton, { backgroundColor: surfaceContainerLow, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={[typeScale.labelLarge, { color: onSurface }]}>BTR-2024-0128</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.bottomInfo}>
        <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
          Escanea el código en la bolsa de café para ver su trazabilidad completa
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  headerText: {
    gap: spacing.xs,
  },
  scannerWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  scannerFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  corners: {
    ...StyleSheet.absoluteFillObject,
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderWidth: 4,
    borderColor: '#F2CE9B',
  },
  scannerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  scannerText: {
    textAlign: 'center',
  },
  scannerHint: {
    textAlign: 'center',
    opacity: 0.7,
  },
  demoSection: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  demoTitle: {
    textAlign: 'center',
  },
  demoButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  demoButton: {
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minWidth: 140,
  },
  bottomInfo: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
});