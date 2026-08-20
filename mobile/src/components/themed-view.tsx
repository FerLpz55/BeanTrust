import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/src/hooks/use-theme-color';

export function ThemedView({ style, ...otherProps }: ViewProps) {
  const backgroundColor = useThemeColor('background');

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}