/**
 * Tipos de la capa offline (§7.5).
 *
 * `OperacionSync` es la fuente de verdad del payload y se comparte con
 * `src/api/sync.ts`; aquí solo se describe cómo vive en la cola local.
 */

import type { OperacionSync } from '@/src/api/sync';

/** Recursos cacheados de respuestas ya autorizadas del usuario actual. */
export type RecursoCache = 'fincas' | 'lotes' | 'lote_detalle';

/** Estados de una operación en la cola. */
export type EstadoCola = 'pendiente' | 'conflicto';

export interface RegistroCola {
  /** Orden FIFO (autoincremental en SQLite). */
  sequence: number;
  /** UUID de la operación; coincide con el `id` del payload (idempotencia). */
  operationId: string;
  userId: string;
  tipo: OperacionSync['tipo'];
  payload: OperacionSync;
  estado: EstadoCola;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

export interface ResumenSync {
  enviadas: number;
  ok: number;
  conflictos: number;
  errores: number;
  pendientes: number;
}
