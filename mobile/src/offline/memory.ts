/**
 * Almacén offline en memoria.
 *
 * Se usa en la web (sin SQLite nativo) y en los tests de Vitest. Implementa la
 * misma semántica que `sqlite.ts`: aislamiento por usuario, cola FIFO y
 * `guardarOptimista` atómico (en este caso, síncrono por naturaleza).
 */

import type { OfflineStorage } from '@/src/offline/storage';
import type { RecursoCache, RegistroCola } from '@/src/offline/types';

interface FilaRecurso {
  resource: RecursoCache;
  resourceId: string;
  data: unknown;
  updatedAt: string;
}

function clave(userId: string, resource: RecursoCache, resourceId: string): string {
  return `${userId}|${resource}|${resourceId}`;
}

export function crearAlmacenMemoria(): OfflineStorage {
  const recursos = new Map<string, FilaRecurso>();
  const cola = new Map<number, RegistroCola>();
  let secuencia = 0;

  return {
    async init() {
      // Sin trabajo de esquema en memoria.
    },

    async cerrar() {
      recursos.clear();
      cola.clear();
      secuencia = 0;
    },

    async guardarRecurso<T>(userId: string, resource: RecursoCache, resourceId: string, data: T) {
      recursos.set(clave(userId, resource, resourceId), {
        resource,
        resourceId,
        data,
        updatedAt: new Date().toISOString(),
      });
    },

    async leerRecurso<T>(userId: string, resource: RecursoCache, resourceId: string) {
      const fila = recursos.get(clave(userId, resource, resourceId));
      return fila ? (fila.data as T) : null;
    },

    async eliminarUsuario(userId) {
      for (const k of [...recursos.keys()]) {
        if (k.startsWith(`${userId}|`)) recursos.delete(k);
      }
      for (const [seq, item] of [...cola.entries()]) {
        if (item.userId === userId) cola.delete(seq);
      }
    },

    async guardarOptimista({ userId, recursos: nuevos, operacion }) {
      const yaEncolada = [...cola.values()].some(
        (item) => item.userId === userId && item.operationId === operacion.id,
      );
      for (const recurso of nuevos) {
        recursos.set(clave(userId, recurso.resource, recurso.resourceId), {
          resource: recurso.resource,
          resourceId: recurso.resourceId,
          data: recurso.data,
          updatedAt: new Date().toISOString(),
        });
      }
      if (yaEncolada) return;
      secuencia += 1;
      cola.set(secuencia, {
        sequence: secuencia,
        operationId: operacion.id,
        userId,
        tipo: operacion.tipo,
        payload: operacion,
        estado: 'pendiente',
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
      });
    },

    async listarCola(userId) {
      return [...cola.values()]
        .filter((item) => item.userId === userId)
        .sort((a, b) => a.sequence - b.sequence);
    },

    async actualizarOperacion(sequence, cambios) {
      const item = cola.get(sequence);
      if (item) cola.set(sequence, { ...item, ...cambios });
    },

    async eliminarOperacion(sequence) {
      cola.delete(sequence);
    },
  };
}
