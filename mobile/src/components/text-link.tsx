/** Enlace de texto (terracota): acciones secundarias — recuperar acceso, crear cuenta. */

import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale } from '@/src/theme/tokens';

interface TextLinkProps {
  label: string;
  onPress: () => void;
  testID?: string;
}

export function TextLink({ label, onPress, testID }: TextLinkProps) {
  const secondary = useThemeColor('secondary');

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="link"
      hitSlop={spacing.sm}
      testID={testID}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <Text style={[typeScale.labelLarge, { color: secondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});