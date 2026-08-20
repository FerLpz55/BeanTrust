/** Stub de VerifiedSeal — reemplazar con implementación real (F03). */

import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale } from '@/src/theme/tokens';

export function VerifiedSeal() {
  const primary = useThemeColor('primary');
  return (
    <View style={[styles.root, { borderColor: primary }]}>
      <Text style={[typeScale.eyebrow, { color: primary }]}>VERIFICADO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
  },
});
