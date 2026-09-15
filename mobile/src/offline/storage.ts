/**
 * Interfaz de persistencia local (§7.5).
 *
 * Es la frontera que permite testear el motor de sync con un almacén en
 * memoria: `sqlite.ts` es la única implementación que toca SQLite.
 */

import type { AdjuntoLocal } from '@/src/evidencia/types';
import type {
  AdjuntoGuardado,
  OperacionPendiente,
  RecursoCache,
  RegistroCola,
} from '@/src/offline/types';

export interface RecursoOptimista {
  resource: RecursoCache;
  resourceId: string;
  data: unknown;
}

export interface GuardarOptimistaArgs {
  userId: string;
  recursos: RecursoOptimista[];
  /** Operaciones a encolar, en orden FIFO (evidencia antes que su cosecha). */
  operaciones: OperacionPendiente[];
  /** Foto persistida que respaldan las operaciones (opcional). */
  adjunto?: AdjuntoLocal;
}

/**
 * Borra el archivo físico de un adjunto. Lo inyecta la fachada (`index.ts`)
 * para que las implementaciones de storage no importen `expo-file-system`.
 */
export type EliminarArchivo = (localPath: string) => Promise<void>;

export interface OfflineStorage {
  init(): Promise<void>;
  cerrar(): Promise<void>;

  guardarRecurso<T>(
    userId: string,
    resource: RecursoCache,
    resourceId: string,
    data: T,
  ): Promise<void>;
  leerRecurso<T>(
    userId: string,
    resource: RecursoCache,
    resourceId: string,
  ): Promise<T | null>;
  eliminarUsuario(userId: string): Promise<void>;

  /**
   * Persiste los recursos optimistas, el adjunto y las operaciones en una
   * **misma transacción**: o queda todo o nada.
   */
  guardarOptimista(args: GuardarOptimistaArgs): Promise<void>;

  guardarAdjunto(adjunto: AdjuntoGuardado): Promise<void>;
  leerAdjunto(userId: string, adjuntoId: string): Promise<AdjuntoGuardado | null>;
  marcarAdjuntoSubido(
    userId: string,
    adjuntoId: string,
    evidenciaJson: string,
  ): Promise<void>;
  /** Borra la fila y el archivo físico del adjunto. */
  eliminarAdjunto(userId: string, adjuntoId: string): Promise<void>;

  listarCola(userId: string): Promise<RegistroCola[]>;
  actualizarOperacion(
    sequence: number,
    cambios: Partial<Pick<RegistroCola, 'estado' | 'attempts' | 'lastError'>>,
  ): Promise<void>;
  eliminarOperacion(sequence: number): Promise<void>;
}
