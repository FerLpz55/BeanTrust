/** Tarjeta de lote para listas de trazabilidad. */

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';
import type { Lote } from '@/src/store/lotes';

interface LoteCardProps {
  lote: Lote;
  onPressId?: (id: string) => void;
}

export const LoteCard = React.memo(function LoteCard({ lote, onPressId }: LoteCardProps) {
  const surfaceContainerLow = useThemeColor('surfaceContainerLow');
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');
  const primary = useThemeColor('primary');

  const handlePress = useCallback(() => {
    onPressId?.(lote.id);
  }, [onPressId, lote.id]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.root,
        { backgroundColor: surfaceContainerLow, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={[typeScale.titleLarge, { color: onSurface }]} numberOfLines={1} ellipsizeMode="tail">
            {lote.variedad}
          </Text>
          <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]} numberOfLines={1}>
            {lote.metodo} · {new Date(lote.fecha_cosecha).toLocaleDateString('es-ES')}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={[typeScale.dataMono, { color: onSurface }]}>
            {lote.peso_actual_kg.toFixed(1)} kg
          </Text>
          <View style={styles.badge}>
            <Text style={[typeScale.eyebrow, { color: primary }]}>{lote.estado}</Text>
          </View>
        </View>
      </View>
      <View style={styles.footer}>
        <IconSymbol size={14} name="tag" color={onSurfaceVariant} />
        <Text
          style={[typeScale.dataMono, styles.footerText, { color: onSurfaceVariant }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {lote.codigo} · {lote.hash_etapa}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: {
    padding: spacing.md,
    borderRadius: radii.large,
    borderCurve: 'continuous',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  left: {
    gap: spacing.xs,
    flex: 1,
  },
  right: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  footerText: {
    flexShrink: 1,
  },
});
