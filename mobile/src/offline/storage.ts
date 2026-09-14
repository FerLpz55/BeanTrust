/**
 * Interfaz de persistencia local (§7.5).
 *
 * Es la frontera que permite testear el motor de sync con un almacén en
 * memoria: `sqlite.ts` es la única implementación que toca SQLite.
 */

import type { OperacionSync } from '@/src/api/sync';
import type { RecursoCache, RegistroCola } from '@/src/offline/types';

export interface RecursoOptimista {
  resource: RecursoCache;
  resourceId: string;
  data: unknown;
}

export interface GuardarOptimistaArgs {
  userId: string;
  recursos: RecursoOptimista[];
  operacion: OperacionSync;
}

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
   * Persiste los recursos optimistas y encola el comando en una **misma
   * transacción**: o quedan ambos o ninguno.
   */
  guardarOptimista(args: GuardarOptimistaArgs): Promise<void>;

  listarCola(userId: string): Promise<RegistroCola[]>;
  actualizarOperacion(
    sequence: number,
    cambios: Partial<Pick<RegistroCola, 'estado' | 'attempts' | 'lastError'>>,
  ): Promise<void>;
  eliminarOperacion(sequence: number): Promise<void>;
}
