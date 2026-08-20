/** Stub de TrazaTimeline — reemplazar con implementación real (F05). */

import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale } from '@/src/theme/tokens';

interface TrazaEvent {
  etapa: string;
  hash: string;
  fecha: string;
}

export function TrazaTimeline({ events }: { events: TrazaEvent[] }) {
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');

  return (
    <View style={styles.root}>
      {events.map((e, i) => (
        <View key={i} style={styles.row}>
          <Text
            style={[typeScale.bodyMedium, styles.etapa, { color: onSurface }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {e.etapa}
          </Text>
          <Text style={[typeScale.dataMono, styles.hash, { color: onSurfaceVariant }]}>
            {e.hash.slice(0, 8)}...
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  etapa: {
    flex: 1,
  },
  hash: {
    flexShrink: 0,
  },
});
