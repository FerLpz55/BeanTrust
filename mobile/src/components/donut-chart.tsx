/**
 * Donut chart real con react-native-svg.
 */

import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { typeScale } from '@/src/theme/tokens';

interface DonutChartProps {
  percentage: number; // 0-100
  size: number;
  strokeWidth?: number;
  primaryColor?: string;
  secondaryColor?: string;
}

export function DonutChart({
  percentage,
  size,
  strokeWidth = 16,
  primaryColor,
  secondaryColor,
}: DonutChartProps) {
  const themePrimary = useThemeColor('primary');
  const themeSecondary = useThemeColor('surfaceContainerHigh');
  const onSurface = useThemeColor('onSurface');
  const onSurfaceVariant = useThemeColor('onSurfaceVariant');

  const foreground = primaryColor ?? themePrimary;
  const background = secondaryColor ?? themeSecondary;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <View style={[{ width: size, height: size }, styles.container]}>
      <Svg width={size} height={size}>
        {/* Background Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={background}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Foreground Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={foreground}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          fill="transparent"
          originX={size / 2}
          originY={size / 2}
          rotation={-90}
        />
      </Svg>
      
      {/* Center Content */}
      <View style={[styles.center, { width: size, height: size }]}>
        <Text style={[typeScale.headlineMedium, { color: onSurface }]}>
          {Math.round(percentage)}%
        </Text>
        <Text style={[typeScale.bodySmall, { color: onSurfaceVariant }]}>
          Directo
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
