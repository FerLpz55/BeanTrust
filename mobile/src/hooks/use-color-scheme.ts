import { useColorScheme as useRNColorScheme } from 'react-native';

import { useTemaStore } from '@/src/store/tema';

/**
 * Esquema de color efectivo: sigue al sistema salvo que Ajustes fuerce
 * "Claro"/"Oscuro" (F14, `src/store/tema.ts`). Único punto de lectura del
 * tema para toda la app (`useThemeColor`, tabs, auth-shell).
 */
export function useColorScheme(): 'light' | 'dark' {
  const sistema = useRNColorScheme();
  const preferencia = useTemaStore((s) => s.preferencia);
  if (preferencia === 'claro') return 'light';
  if (preferencia === 'oscuro') return 'dark';
  return sistema ?? 'light';
}
