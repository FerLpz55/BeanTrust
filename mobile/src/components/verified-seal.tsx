import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale } from '@/src/theme/tokens';
import { IconSymbol } from '@/src/components/ui/icon-symbol';

export function VerifiedSeal() {
  const tertiaryContainer = useThemeColor('tertiaryContainer');
  const tertiary = useThemeColor('tertiary');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');

  return (
    <View style={styles.root}>
      <View style={[styles.circle, { backgroundColor: tertiaryContainer }]}>
        <IconSymbol name="verified" size={32} color={tertiary} />
      </View>
      <View style={styles.textContainer}>
        <Text style={[typeScale.labelMedium, { color: tertiary }]}>Origen Validado</Text>
        <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }]}>Inmutablemente</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
  },
});
