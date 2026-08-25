/** Botón primario: bosque sobre papel, con estados pressed/disabled/loading y haptics. */

import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColor } from '@/src/hooks/use-theme-color';
import { radii, spacing, typeScale } from '@/src/theme/tokens';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  testID?: string;
  style?: import('react-native').ViewStyle;
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  loadingLabel = 'Iniciando…',
  disabled = false,
  testID,
  style,
}: PrimaryButtonProps) {
  const primary = useThemeColor('primary');
  const onPrimary = useThemeColor('onPrimary');

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={() => {
        if (isDisabled) return;
        Haptics.selectionAsync();
        onPress();
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary },
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={onPrimary} testID={`${testID ?? 'btn'}-loading`} />
        ) : null}
        <Text style={[typeScale.labelLarge, { color: onPrimary }]}>
          {loading ? loadingLabel : label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: radii.large,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});