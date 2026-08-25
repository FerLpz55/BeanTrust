import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { useTemaStore } from '@/src/store/tema';

/**
 * To support static rendering, this value needs to be re-calculated on the
 * client side for web. Además respeta la preferencia forzada de Ajustes
 * (F14, `src/store/tema.ts`) igual que la versión nativa.
 */
export function useColorScheme(): 'light' | 'dark' {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const sistema = useRNColorScheme();
  const preferencia = useTemaStore((s) => s.preferencia);

  if (preferencia === 'claro') return 'light';
  if (preferencia === 'oscuro') return 'dark';
  if (hasHydrated) return sistema ?? 'light';
  return 'light';
}
