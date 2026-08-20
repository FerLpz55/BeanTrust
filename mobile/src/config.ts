/**
 * Configuración de la app. Las variables `EXPO_PUBLIC_*` se inyectan en build
 * time desde `.env` (o el entorno) y quedan embebidas en el bundle.
 */

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

export const API_TIMEOUT_MS = 15000;