/**
 * Pasaporte de Café: verificación pública (§8).
 *
 * El grupo `verificar/` vive fuera del auth: se envía `token: null` para no
 * mandar credenciales en un flujo anónimo.
 */

import { apiRequest } from '@/src/api/client';
import type { VerificarRead } from '@/src/api/types';

export function verificarCodigo(codigo: string): Promise<VerificarRead> {
  return apiRequest<VerificarRead>(`/v1/verificar/${encodeURIComponent(codigo)}`, {
    token: null,
  });
}
