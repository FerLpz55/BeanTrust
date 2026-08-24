/**
 * Componente StatusChip que muestra el estado de un lote con su color semántico.
 */
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';
import { LoteEstado } from '@/src/store/lotes';

interface StatusChipProps {
  estado: LoteEstado;
}

export function StatusChip({ estado }: StatusChipProps) {
  let bgColorRole: any;
  let textColorRole: any;

  switch (estado) {
    case 'CEREZA':
      bgColorRole = 'tertiary';
      textColorRole = 'onTertiaryContainer';
      break;
    case 'PERGAMINO':
      bgColorRole = 'secondaryContainer';
      textColorRole = 'onSecondaryContainer';
      break;
    case 'ORO':
      bgColorRole = 'secondary';
      textColorRole = 'onPrimary';
      break;
    case 'TOSTADO':
      bgColorRole = 'primary';
      textColorRole = 'onPrimary';
      break;
    case 'VENDIDO':
      bgColorRole = 'primaryContainer';
      textColorRole = 'onPrimaryContainer';
      break;
    case 'RECHAZADO':
      bgColorRole = 'errorContainer';
      textColorRole = 'onErrorContainer';
      break;
    default:
      bgColorRole = 'surfaceContainerHigh';
      textColorRole = 'onSurfaceVariant';
      break;
  }

  const bgColor = useThemeColor(bgColorRole);
  const textColor = useThemeColor(textColorRole);

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{estado}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  text: {
    ...typeScale.eyebrow,
  },
});
