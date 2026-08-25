/** Pagos y saldo (§9, B13). Dinero simulado: web3 en pausa (B7). */

import { apiRequest } from '@/src/api/client';
import type { Pagina, PagoRead, SaldoRead } from '@/src/api/types';

/** Historial de la cooperativa autenticada (paginado por cursor). */
export function listarPagos(limit = 20, cursor?: string | null): Promise<Pagina<PagoRead>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest<Pagina<PagoRead>>(`/v1/pagos?${params}`);
}

/** Saldo del productor: 97% de ventas confirmadas + propinas confirmadas. */
export function obtenerSaldo(): Promise<SaldoRead> {
  return apiRequest<SaldoRead>('/v1/pagos/saldo');
}
