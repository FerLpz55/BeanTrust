/** Color semántico del tema activo (light/dark). */

import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { colors } from '@/src/theme/tokens';

export type ColorRole = keyof typeof colors.light & keyof typeof colors.dark;

export function useThemeColor(colorName: ColorRole) {
  const theme = useColorScheme() ?? 'light';
  return colors[theme][colorName];
}