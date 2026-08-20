/** Stub de StatusChip — reemplazar con implementación real. */

import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

export function StatusChip({ estado }: { estado: string }) {
  const primary = useThemeColor('primary');
  const onPrimary = useThemeColor('onPrimary');
  return (
    <View style={[styles.root, { backgroundColor: primary }]}>
      <Text style={[typeScale.eyebrow, { color: onPrimary }]}>{estado}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
});
