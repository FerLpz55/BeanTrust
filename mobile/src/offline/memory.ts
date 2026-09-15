/**
 * Almacén offline en memoria.
 *
 * Se usa en la web (sin SQLite nativo) y en los tests de Vitest. Implementa la
 * misma semántica que `sqlite.ts`: aislamiento por usuario, cola FIFO y
 * `guardarOptimista` atómico (en este caso, síncrono por naturaleza).
 *
 * El borrado de archivos físicos es inyectable: en memoria no hay sistema de
 * archivos, así que por defecto es un no-op y los tests pueden espiarlo.
 */

import type { AdjuntoGuardado, RecursoCache, RegistroCola } from '@/src/offline/types';
import type { EliminarArchivo, OfflineStorage } from '@/src/offline/storage';

interface FilaRecurso {
  resource: RecursoCache;
  resourceId: string;
  data: unknown;
  updatedAt: string;
}

export interface OpcionesAlmacenMemoria {
  eliminarArchivo?: EliminarArchivo;
}

function claveRecurso(userId: string, resource: RecursoCache, resourceId: string): string {
  return `${userId}|${resource}|${resourceId}`;
}

function claveAdjunto(userId: string, adjuntoId: string): string {
  return `${userId}|${adjuntoId}`;
}

export function crearAlmacenMemoria(opciones: OpcionesAlmacenMemoria = {}): OfflineStorage {
  const eliminarArchivo: EliminarArchivo = opciones.eliminarArchivo ?? (async () => {});
  const recursos = new Map<string, FilaRecurso>();
  const adjuntos = new Map<string, AdjuntoGuardado>();
  const cola = new Map<number, RegistroCola>();
  let secuencia = 0;

  function encolar(userId: string, payload: RegistroCola['payload']): void {
    const yaEncolada = [...cola.values()].some(
      (item) => item.userId === userId && item.operationId === payload.id,
    );
    if (yaEncolada) return;
    secuencia += 1;
    cola.set(secuencia, {
      sequence: secuencia,
      operationId: payload.id,
      userId,
      tipo: payload.tipo,
      payload,
      estado: 'pendiente',
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
  }

  async function borrarAdjunto(userId: string, adjuntoId: string): Promise<void> {
    const k = claveAdjunto(userId, adjuntoId);
    const fila = adjuntos.get(k);
    if (!fila) return;
    adjuntos.delete(k);
    await eliminarArchivo(fila.localPath);
  }

  return {
    async init() {
      // Sin trabajo de esquema en memoria.
    },

    async cerrar() {
      recursos.clear();
      adjuntos.clear();
      cola.clear();
      secuencia = 0;
    },

    async guardarRecurso<T>(userId: string, resource: RecursoCache, resourceId: string, data: T) {
      recursos.set(claveRecurso(userId, resource, resourceId), {
        resource,
        resourceId,
        data,
        updatedAt: new Date().toISOString(),
      });
    },

    async leerRecurso<T>(userId: string, resource: RecursoCache, resourceId: string) {
      const fila = recursos.get(claveRecurso(userId, resource, resourceId));
      return fila ? (fila.data as T) : null;
    },

    async eliminarUsuario(userId: string) {
      for (const k of [...recursos.keys()]) {
        if (k.startsWith(`${userId}|`)) recursos.delete(k);
      }
      for (const [seq, item] of [...cola.entries()]) {
        if (item.userId === userId) cola.delete(seq);
      }
      for (const [k, adjunto] of [...adjuntos.entries()]) {
        if (adjunto.userId === userId) {
          adjuntos.delete(k);
          await eliminarArchivo(adjunto.localPath);
        }
      }
    },

    async guardarOptimista({ userId, recursos: nuevos, operaciones, adjunto }) {
      for (const recurso of nuevos) {
        recursos.set(claveRecurso(userId, recurso.resource, recurso.resourceId), {
          resource: recurso.resource,
          resourceId: recurso.resourceId,
          data: recurso.data,
          updatedAt: new Date().toISOString(),
        });
      }
      if (adjunto) {
        adjuntos.set(claveAdjunto(userId, adjunto.id), {
          ...adjunto,
          userId,
          evidenciaJson: null,
          estado: 'pendiente',
          createdAt: new Date().toISOString(),
        });
      }
      for (const operacion of operaciones) encolar(userId, operacion);
    },

    async guardarAdjunto(adjunto) {
      adjuntos.set(claveAdjunto(adjunto.userId, adjunto.id), adjunto);
    },

    async leerAdjunto(userId, adjuntoId) {
      return adjuntos.get(claveAdjunto(userId, adjuntoId)) ?? null;
    },

    async marcarAdjuntoSubido(userId, adjuntoId, evidenciaJson) {
      const k = claveAdjunto(userId, adjuntoId);
      const fila = adjuntos.get(k);
      if (fila) adjuntos.set(k, { ...fila, evidenciaJson, estado: 'subido' });
    },

    async eliminarAdjunto(userId, adjuntoId) {
      await borrarAdjunto(userId, adjuntoId);
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
