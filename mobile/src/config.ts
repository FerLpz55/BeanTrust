/**
 * Configuración de la app. Las variables `EXPO_PUBLIC_*` se inyectan en build
 * time desde `.env` (o el entorno) y quedan embebidas en el bundle.
 *
 * Regla dura de release: `localhost` solo existe en desarrollo. Un build de
 * preview/producción sin `EXPO_PUBLIC_API_URL` —o con `http://`— debe fallar en
 * build/arranque en lugar de apuntar silenciosamente a un backend inexistente.
 */

export const API_TIMEOUT_MS = 15000;

const DEV_API_URL = 'http://localhost:8000';

/**
 * Resuelve la URL del backend. Exportada para poder probar las reglas de build
 * sin depender de `__DEV__`.
 */
export function resolverApiUrl(raw: string | undefined, esDev: boolean): string {
  const valor = raw?.trim();
  if (!valor) {
    if (esDev) return DEV_API_URL;
    throw new Error(
      'Falta EXPO_PUBLIC_API_URL: un build de preview/producción no puede apuntar a localhost.'
    );
  }
  if (!esDev && !valor.startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_API_URL debe usar HTTPS fuera de desarrollo.');
  }
  return valor;
}

const esDev = typeof __DEV__ === 'boolean' ? __DEV__ : true;

export const API_URL = resolverApiUrl(process.env.EXPO_PUBLIC_API_URL, esDev);
