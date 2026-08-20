/** Sello de certificación: el elemento firma de la marca.
 *
 * Eco del certificado QR de BeanTrust: un disco con doble borde (línea
 * exterior dentada + aro interior sólido) que estampa el "registro de campo".
 * Monocromo tinta/bosque sobre papel, como los sellos reales de certificación.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { useThemeColor } from '@/src/hooks/use-theme-color';

interface SealProps {
  size?: number;
}

export function BrandMark({ size = 72 }: SealProps) {
  const ink = useThemeColor('onSurface');
  const forest = useThemeColor('primary');
  const paper = useThemeColor('surface');
  const cherry = useThemeColor('tertiary');

  const leaf = size * 0.42;

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden>
      {/* Borde exterior dentado */}
      <View
        style={[
          styles.outer,
          {
            width: size,
            height: size,
            borderColor: ink,
            borderRadius: size / 2,
          },
        ]}
      />
      {/* Aro interior sólido */}
      <View
        style={[
          styles.inner,
          {
            width: size - 10,
            height: size - 10,
            borderRadius: (size - 10) / 2,
            borderColor: forest,
            backgroundColor: paper,
          },
        ]}
      >
        <MaterialIcons name="eco" size={leaf} color={cherry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  inner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    margin: 5,
  },
});