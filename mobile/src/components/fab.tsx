/** Floating Action Button — acción primaria flotante. */

import { Pressable, StyleSheet, View } from 'react-native';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing } from '@/src/theme/tokens';

interface FABProps {
  iconName: string;
  onPress: () => void;
  accessibilityLabel: string;
}

export function FAB({ iconName, onPress, accessibilityLabel }: FABProps) {
  const primary = useThemeColor('primary');
  const onPrimary = useThemeColor('onPrimary');

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={({ pressed }) => [styles.root, { backgroundColor: primary, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.inner}>
        <IconSymbol size={28} name={iconName} color={onPrimary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xxl + 16,
    width: 56,
    height: 56,
    borderRadius: radii.full,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
