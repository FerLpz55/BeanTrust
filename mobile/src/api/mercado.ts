/**
 * Panel Comercio Justo (B16, ADR-9).
 *
 * Proyección de **solo lectura**: la app nunca escribe el mercado.
 */

import { apiRequest } from '@/src/api/client';
import type { MercadoLoteRead } from '@/src/api/types';

export function obtenerPanelLote(loteId: string): Promise<MercadoLoteRead> {
  return apiRequest<MercadoLoteRead>(`/v1/mercado/${loteId}`);
}
