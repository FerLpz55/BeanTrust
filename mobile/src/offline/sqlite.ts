/**
 * Persistencia offline con SQLite (expo-sqlite, SDK 54).
 *
 * Único archivo de la app que ejecuta SQL. Dos tablas:
 * - `cached_resource`: respuestas autorizadas del usuario (aisladas por
 *   `user_id`).
 * - `sync_queue`: cola FIFO de operaciones pendientes/conflicto.
 *
 * `guardarOptimista` corre dentro de una transacción para que el dato
 * optimista y el comando encolado no se separen nunca.
 */

import * as SQLite from 'expo-sqlite';

import type { GuardarOptimistaArgs, OfflineStorage } from '@/src/offline/storage';
import type { RecursoCache, RegistroCola } from '@/src/offline/types';

const ESQUEMA = `
create table if not exists cached_resource (
  user_id text not null,
  resource text not null,
  resource_id text not null,
  data_json text not null,
  updated_at text not null,
  primary key (user_id, resource, resource_id)
);

create table if not exists sync_queue (
  sequence integer primary key autoincrement,
  operation_id text not null,
  user_id text not null,
  tipo text not null,
  payload_json text not null,
  estado text not null default 'pendiente',
  attempts integer not null default 0,
  last_error text,
  created_at text not null
);

create unique index if not exists sync_queue_usuario_operacion
  on sync_queue (user_id, operation_id);
`;

const UPSERT_RECURSO = `
insert into cached_resource (user_id, resource, resource_id, data_json, updated_at)
values (?, ?, ?, ?, ?)
on conflict (user_id, resource, resource_id) do update set
  data_json = excluded.data_json,
  updated_at = excluded.updated_at
`;

interface FilaCola {
  sequence: number;
  operation_id: string;
  user_id: string;
  tipo: string;
  payload_json: string;
  estado: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

function aRegistro(fila: FilaCola): RegistroCola {
  return {
    sequence: fila.sequence,
    operationId: fila.operation_id,
    userId: fila.user_id,
    tipo: fila.tipo as RegistroCola['tipo'],
    payload: JSON.parse(fila.payload_json) as RegistroCola['payload'],
    estado: fila.estado as RegistroCola['estado'],
    attempts: fila.attempts,
    lastError: fila.last_error,
    createdAt: fila.created_at,
  };
}

export async function crearAlmacenSqlite(
  nombre = 'beantrust-offline.db',
): Promise<OfflineStorage> {
  const db = await SQLite.openDatabaseAsync(nombre);

  async function guardarEnTx(
    userId: string,
    resource: RecursoCache,
    resourceId: string,
    data: unknown,
  ): Promise<void> {
    await db.runAsync(UPSERT_RECURSO, [
      userId,
      resource,
      resourceId,
      JSON.stringify(data),
      new Date().toISOString(),
    ]);
  }

  return {
    async init() {
      await db.execAsync(ESQUEMA);
    },

    async cerrar() {
      await db.closeAsync();
    },

    async guardarRecurso<T>(userId: string, resource: RecursoCache, resourceId: string, data: T) {
      await guardarEnTx(userId, resource, resourceId, data);
    },

    async leerRecurso<T>(userId: string, resource: RecursoCache, resourceId: string) {
      const fila = await db.getFirstAsync<{ data_json: string }>(
        'select data_json from cached_resource where user_id = ? and resource = ? and resource_id = ?',
        [userId, resource, resourceId],
      );
      return fila ? (JSON.parse(fila.data_json) as T) : null;
    },

    async eliminarUsuario(userId) {
      await db.withTransactionAsync(async () => {
        await db.runAsync('delete from cached_resource where user_id = ?', [userId]);
        await db.runAsync('delete from sync_queue where user_id = ?', [userId]);
      });
    },

    async guardarOptimista({ userId, recursos, operacion }: GuardarOptimistaArgs) {
      await db.withTransactionAsync(async () => {
        for (const recurso of recursos) {
          await guardarEnTx(userId, recurso.resource, recurso.resourceId, recurso.data);
        }
        await db.runAsync(
          `insert or ignore into sync_queue
             (operation_id, user_id, tipo, payload_json, estado, attempts, last_error, created_at)
           values (?, ?, ?, ?, 'pendiente', 0, null, ?)`,
          [operacion.id, userId, operacion.tipo, JSON.stringify(operacion), new Date().toISOString()],
        );
      });
    },

    async listarCola(userId) {
      const filas = await db.getAllAsync<FilaCola>(
        'select * from sync_queue where user_id = ? order by sequence asc',
        [userId],
      );
      return filas.map(aRegistro);
    },

    async actualizarOperacion(sequence, cambios) {
      const asignaciones: string[] = [];
      const valores: (string | number | null)[] = [];
      if (cambios.estado !== undefined) {
        asignaciones.push('estado = ?');
        valores.push(cambios.estado);
      }
      if (cambios.attempts !== undefined) {
        asignaciones.push('attempts = ?');
        valores.push(cambios.attempts);
      }
      if (cambios.lastError !== undefined) {
        asignaciones.push('last_error = ?');
        valores.push(cambios.lastError);
      }
      if (asignaciones.length === 0) return;
      valores.push(sequence);
      await db.runAsync(
        `update sync_queue set ${asignaciones.join(', ')} where sequence = ?`,
        valores,
      );
    },

    async eliminarOperacion(sequence) {
      await db.runAsync('delete from sync_queue where sequence = ?', [sequence]);
    },
  };
}
