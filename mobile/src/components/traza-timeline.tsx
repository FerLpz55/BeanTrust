/**
 * Componente TrazaTimeline que muestra los eventos del lote en una línea de tiempo vertical.
 *
 * `TrazaTimelineItem` es la fila aislada y se usa tanto en el `.map()` de
 * `TrazaTimeline` (pasaporte público) como en la FlashList del detalle de lote.
 * Como la virtualización no permite una única línea absoluta que cruce todos
 * los nodos, cada fila dibuja su propio conector hacia la siguiente.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale } from '@/src/theme/tokens';
import { LoteEvento, EVENTO_ICONO } from '@/src/store/lotes';
import { IconSymbol } from '@/src/components/ui/icon-symbol';

interface TrazaTimelineProps {
  events: LoteEvento[];
  showPending?: boolean;
}

export function TrazaTimeline({ events, showPending = true }: TrazaTimelineProps) {
  const visibleEvents = showPending ? events : events.filter(e => e.completed);

  return (
    <View style={styles.container}>
      {visibleEvents.map((event, index) => (
        <TrazaTimelineItem
          key={event.id}
          event={event}
          isLast={index === visibleEvents.length - 1}
        />
      ))}
    </View>
  );
}

/** Fila del timeline (nodo + contenido). Reutilizable como `renderItem`. */
export const TrazaTimelineItem = React.memo(function TrazaTimelineItem({
  event,
  isLast,
}: {
  event: LoteEvento;
  isLast: boolean;
}) {
  const { completed, tipo, descripcion, fecha, hash_etapa } = event;
  const lineColor = useThemeColor('outlineVariant');
  const nodeBg = useThemeColor(completed ? 'primary' : 'surfaceContainerLow');
  const iconColor = useThemeColor(completed ? 'onPrimary' : 'onSurfaceVariant');
  const titleColor = useThemeColor(completed ? 'onSurface' : 'onSurfaceVariant');
  const descColor = useThemeColor('onSurfaceVariant');
  const hashBg = useThemeColor('surfaceContainerLow');

  // Format date simply
  let dateFormatted = '';
  if (completed && fecha) {
    const d = new Date(fecha);
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('es-ES', { month: 'short' });
    const year = d.getFullYear();
    dateFormatted = `${day} ${month} ${year}`;
  }

  return (
    <View style={[styles.nodeContainer, isLast && styles.nodeContainerLast]}>
      {!isLast && <View style={[styles.connector, { backgroundColor: lineColor }]} />}
      <View style={styles.iconContainer}>
        <View style={[styles.nodeCircle, { backgroundColor: nodeBg, opacity: completed ? 1 : 0.4 }]}>
          <IconSymbol name={EVENTO_ICONO[tipo]} size={12} color={iconColor} />
        </View>
      </View>
      
      <View style={styles.contentContainer}>
        <Text style={[styles.title, { color: titleColor }]}>{tipo}</Text>
        
        {completed && (
          <>
            <Text style={[styles.description, { color: descColor }]}>{descripcion}</Text>
            <Text style={[styles.date, { color: descColor }]}>{dateFormatted}</Text>
            
            {!!hash_etapa && (
              <View style={[styles.hashBadge, { backgroundColor: hashBg }]}>
                <IconSymbol name="lock" size={10} color={descColor} />
                <Text style={[styles.hashText, { color: descColor }]}>
                  {hash_etapa}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
});
TrazaTimelineItem.displayName = 'TrazaTimelineItem';

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    paddingLeft: 0,
  },
  connector: {
    position: 'absolute',
    top: 12,
    // Se extiende sobre el `marginBottom` de la fila para que la línea llegue
    // hasta el siguiente nodo aunque cada fila se renderice por separado.
    bottom: -spacing.lg,
    left: 11,
    width: 2,
    zIndex: 0,
  },
  nodeContainer: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  nodeContainerLast: {
    marginBottom: 0,
  },
  iconContainer: {
    width: 24,
    marginRight: spacing.md,
    alignItems: 'center',
    zIndex: 1,
  },
  nodeCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    flex: 1,
    paddingTop: 2, // align text with the center of the 24px icon (icon is 24, text is ~20)
  },
  title: {
    ...typeScale.labelMedium,
    marginBottom: 2,
  },
  description: {
    ...typeScale.bodySmall,
    marginBottom: 2,
  },
  date: {
    ...typeScale.bodySmall,
    marginBottom: spacing.sm,
  },
  hashBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.sm,
    gap: 4,
  },
  hashText: {
    ...typeScale.dataMono,
  },
});
