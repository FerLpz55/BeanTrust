/** Estado vacío reutilizable con icono, texto y acción. */

import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/src/components/primary-button';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { spacing, typeScale } from '@/src/theme/tokens';

interface EmptyStateProps {
  title: string;
  description: string;
  iconName: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, iconName, actionLabel, onAction }: EmptyStateProps) {
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');

  return (
    <View style={styles.root}>
      <IconSymbol size={56} name={iconName} color={onSurfaceVariant} />
      <Text style={[typeScale.titleLarge, { color: onSurface }, styles.title]}>
        {title}
      </Text>
      <Text style={[typeScale.bodyMedium, { color: onSurfaceVariant }, styles.description]}>
        {description}
      </Text>
      {actionLabel && onAction && (
        <PrimaryButton label={actionLabel} onPress={onAction} style={styles.button} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
    gap: spacing.md,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    maxWidth: 280,
  },
  button: {
    marginTop: spacing.md,
  },
});
