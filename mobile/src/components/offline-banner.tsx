/** Banner de operaciones pendientes por sincronizar (§7.5). */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

interface OfflineBannerProps {
  pendingCount: number;
  onRetry: () => void;
  sincronizando?: boolean;
}

export function OfflineBanner({ pendingCount, onRetry, sincronizando = false }: OfflineBannerProps) {
  const secondaryContainer = useThemeColor('secondaryContainer');
  const onSecondaryContainer = useThemeColor('onSecondaryContainer');
  const secondary = useThemeColor('secondary');

  if (pendingCount === 0) return null;

  const etiqueta =
    pendingCount === 1 ? '1 operación sin sincronizar' : `${pendingCount} operaciones sin sincronizar`;

  return (
    <View style={[styles.root, { backgroundColor: secondaryContainer }]}>
      <View style={styles.row}>
        <IconSymbol size={20} name="cloud-off" color={secondary} />
        <View style={styles.text}>
          <Text style={[typeScale.bodyMedium, { color: onSecondaryContainer }]}>{etiqueta}</Text>
        </View>
        <Pressable
          onPress={onRetry}
          disabled={sincronizando}
          accessibilityRole="button"
          accessibilityState={{ disabled: sincronizando }}
          style={({ pressed }) => [styles.button, { opacity: pressed || sincronizando ? 0.6 : 1 }]}
        >
          <Text style={[typeScale.labelMedium, { color: secondary }]}>
            {sincronizando ? 'Sincronizando…' : 'Sincronizar'}
          </Text>
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
