/** Propinas al productor: 100% directas, idempotentes (ADR-10). */

import { apiRequest } from '@/src/api/client';
import type { PropinaListRead, PropinaRead } from '@/src/api/types';

export function enviarPropina(
  loteId: string,
  monto: number,
  claveIdempotencia: string,
  moneda = 'MXN'
): Promise<PropinaRead> {
  return apiRequest<PropinaRead>('/v1/propinas', {
    method: 'POST',
    body: { lote_id: loteId, monto, moneda },
    idempotencyKey: claveIdempotencia,
  });
}

export function listarPropinasLote(loteId: string): Promise<PropinaListRead[]> {
  return apiRequest<PropinaListRead[]>(`/v1/propinas/lote/${loteId}`);
}
