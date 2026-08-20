/** Tarjeta métrica para el bento grid del dashboard. */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

interface MetricCardProps {
  iconName: string;
  iconColor: string;
  label: string;
  value: string;
  sublabel: string;
  onPress?: () => void;
}

export const MetricCard = React.memo(function MetricCard({ iconName, iconColor, label, value, sublabel, onPress }: MetricCardProps) {
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        { backgroundColor: surfaceContainerLow, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.iconRow}>
        <IconSymbol size={24} name={iconName} color={iconColor} />
      </View>
      <Text style={[typeScale.eyebrow, { color: onSurfaceVariant }, styles.label]}>
        {label}
      </Text>
      <Text style={[typeScale.headlineMedium, { color: iconColor }, styles.value]}>
        {value}
      </Text>
      <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>{sublabel}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: '45%',
    padding: spacing.lg,
    borderRadius: radii.large,
    borderCurve: 'continuous',
    gap: spacing.xs,
  },
  iconRow: {
    marginBottom: spacing.xs,
  },
  label: {
    textTransform: 'uppercase',
  },
  value: {
    marginTop: spacing.xs,
  },
});
