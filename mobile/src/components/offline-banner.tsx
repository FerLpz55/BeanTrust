/** Banner de alerta cuando hay lotes pendientes por sincronizar. */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

interface OfflineBannerProps {
  pendingCount: number;
  onRetry: () => void;
}

export function OfflineBanner({ pendingCount, onRetry }: OfflineBannerProps) {
  const secondaryContainer = useThemeColor('secondaryContainer');
  const onSecondaryContainer = useThemeColor('onSecondaryContainer');
  const secondary = useThemeColor('secondary');

  if (pendingCount === 0) return null;

  return (
    <View style={[styles.root, { backgroundColor: secondaryContainer }]}>
      <View style={styles.row}>
        <IconSymbol size={20} name="cloud_off" color={secondary} />
        <View style={styles.text}>
          <Text style={[typeScale.bodyMedium, { color: onSecondaryContainer }]}>
            Lote #402 guardado offline — Esperando red
          </Text>
        </View>
        <Pressable onPress={onRetry} style={styles.button}>
          <Text style={[typeScale.labelMedium, { color: secondary }]}>Reintentar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.medium,
    borderCurve: 'continuous',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    flex: 1,
  },
  button: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
