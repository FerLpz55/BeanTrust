/** Lotes y eventos de trazabilidad (§6). */

import { apiRequest } from '@/src/api/client';
import type {
  EventoCreate,
  LoteCreate,
  LoteDetalleRead,
  LoteRead,
  Pagina,
} from '@/src/api/types';

export function listarLotes(limit = 20, cursor?: string | null): Promise<Pagina<LoteRead>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<Pagina<LoteRead>>(`/v1/lotes?${params}`);
}

export function obtenerLote(loteId: string): Promise<LoteDetalleRead> {
  return apiRequest<LoteDetalleRead>(`/v1/lotes/${loteId}`);
}

/**
 * Crea el lote. La deduplicación va por `body.id` (UUID del móvil), NO por
 * header: `POST /v1/lotes` no declara `Idempotency-Key` (§6: "No (da id)").
 */
export function crearLote(datos: LoteCreate): Promise<LoteRead> {
  return apiRequest<LoteRead>('/v1/lotes', { method: 'POST', body: datos });
}

/** Avanza el lote. Idempotente por header: un reintento no duplica el evento. */
export function registrarEvento(
  loteId: string,
  evento: EventoCreate,
  claveIdempotencia: string
): Promise<LoteDetalleRead> {
  return apiRequest<LoteDetalleRead>(`/v1/lotes/${loteId}/eventos`, {
    method: 'POST',
    body: evento,
    idempotencyKey: claveIdempotencia,
  });
}
