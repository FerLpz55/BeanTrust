/**
 * Tipos de la capa offline (§7.5).
 *
 * `OperacionSync` es la fuente de verdad de los payloads que viajan a
 * `/v1/sync`; `OperacionSubirEvidencia` es una operación **local** que sube el
 * binario a `POST /v1/evidencias` antes de registrar la cosecha. Ambas comparten
 * la misma cola FIFO para que una cosecha nunca adelante a su foto.
 */

import type { OperacionSync } from '@/src/api/sync';
import type { AdjuntoLocal } from '@/src/evidencia/types';

/** Recursos cacheados de respuestas ya autorizadas del usuario actual. */
export type RecursoCache = 'fincas' | 'lotes' | 'lote_detalle';

/** Estados de una operación en la cola. */
export type EstadoCola = 'pendiente' | 'conflicto';

/**
 * Operación local: sube la foto al bucket privado. No viaja a `/v1/sync`; la
 * ejecuta el motor contra `POST /v1/evidencias`.
 */
export interface OperacionSubirEvidencia {
  tipo: 'subir_evidencia';
  /** UUID de la evidencia; también `Idempotency-Key` de la subida. */
  id: string;
  lote_id: string;
  finca_id: string;
  adjunto_id: string;
}

export type OperacionPendiente = OperacionSync | OperacionSubirEvidencia;

/** Fila de la tabla `attachments`: metadatos de la foto persistida. */
export interface AdjuntoGuardado extends AdjuntoLocal {
  userId: string;
  /** `EvidenciaRead` serializado tras subirla (null mientras está pendiente). */
  evidenciaJson: string | null;
  estado: 'pendiente' | 'subido';
  createdAt: string;
}

export interface RegistroCola {
  /** Orden FIFO (autoincremental en SQLite). */
  sequence: number;
  /** UUID de la operación; coincide con el `id` del payload (idempotencia). */
  operationId: string;
  userId: string;
  tipo: OperacionPendiente['tipo'];
  payload: OperacionPendiente;
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
