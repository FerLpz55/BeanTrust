/** Pagos y saldo (§9, B13). Dinero simulado: web3 en pausa (B7). */

import { apiRequest } from '@/src/api/client';
import type { Pagina, PagoCreate, PagoRead, SaldoRead, UsuarioRead } from '@/src/api/types';

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

/**
 * Registra la venta de un lote TOSTADO (rol cooperativa/admin). Dispara el
 * pago simulado (`FakeGatewayPagos`, 97/3, `tx_hash` determinista) — 202
 * porque la confirmación corre después en segundo plano (§9, B7 en pausa).
 */
export function crearPago(datos: PagoCreate, claveIdempotencia: string): Promise<PagoRead> {
  return apiRequest<PagoRead>('/v1/pagos', {
    method: 'POST',
    body: datos,
    idempotencyKey: claveIdempotencia,
  });
}

/** Directorio de compradores para elegir `comprador_id` al vender. */
export function listarCompradores(): Promise<UsuarioRead[]> {
  return apiRequest<UsuarioRead[]>('/v1/compradores');
}
