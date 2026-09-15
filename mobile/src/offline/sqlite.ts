/**
 * Persistencia offline con SQLite (expo-sqlite, SDK 54).
 *
 * Único archivo de la app que ejecuta SQL. Tres tablas:
 * - `cached_resource`: respuestas autorizadas del usuario (aisladas por
 *   `user_id`).
 * - `sync_queue`: cola FIFO de operaciones pendientes/conflicto.
 * - `attachments`: metadatos de las fotos persistidas en disco.
 *
 * `guardarOptimista` corre dentro de una transacción para que el dato
 * optimista, la foto y los comandos encolados no se separen nunca.
 */

import * as SQLite from 'expo-sqlite';

import type { EliminarArchivo, GuardarOptimistaArgs, OfflineStorage } from '@/src/offline/storage';
import type {
  AdjuntoGuardado,
  OperacionPendiente,
  RecursoCache,
  RegistroCola,
} from '@/src/offline/types';

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

create table if not exists attachments (
  id text primary key,
  user_id text not null,
  lote_id text not null,
  local_path text not null,
  mime text not null,
  bytes integer not null,
  sha256 text not null,
  evidencia_json text,
  estado text not null default 'pendiente',
  created_at text not null
);

create index if not exists attachments_user_lote
  on attachments (user_id, lote_id);
`;

const UPSERT_RECURSO = `
insert into cached_resource (user_id, resource, resource_id, data_json, updated_at)
values (?, ?, ?, ?, ?)
on conflict (user_id, resource, resource_id) do update set
  data_json = excluded.data_json,
  updated_at = excluded.updated_at
`;

const INSERT_OPERACION = `
insert or ignore into sync_queue
  (operation_id, user_id, tipo, payload_json, estado, attempts, last_error, created_at)
values (?, ?, ?, ?, 'pendiente', 0, null, ?)
`;

const INSERT_ADJUNTO = `
insert or replace into attachments
  (id, user_id, lote_id, local_path, mime, bytes, sha256, evidencia_json, estado, created_at)
values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

interface FilaAdjunto {
  id: string;
  user_id: string;
  lote_id: string;
  local_path: string;
  mime: string;
  bytes: number;
  sha256: string;
  evidencia_json: string | null;
  estado: string;
  created_at: string;
}

function aRegistro(fila: FilaCola): RegistroCola {
  return {
    sequence: fila.sequence,
    operationId: fila.operation_id,
    userId: fila.user_id,
    tipo: fila.tipo as RegistroCola['tipo'],
    payload: JSON.parse(fila.payload_json) as OperacionPendiente,
    estado: fila.estado as RegistroCola['estado'],
    attempts: fila.attempts,
    lastError: fila.last_error,
    createdAt: fila.created_at,
  };
}

function aAdjunto(fila: FilaAdjunto): AdjuntoGuardado {
  return {
    id: fila.id,
    userId: fila.user_id,
    loteId: fila.lote_id,
    localPath: fila.local_path,
    mime: fila.mime as AdjuntoGuardado['mime'],
    bytes: fila.bytes,
    sha256: fila.sha256,
    evidenciaJson: fila.evidencia_json,
    estado: fila.estado as AdjuntoGuardado['estado'],
    createdAt: fila.created_at,
  };
}

export interface OpcionesAlmacenSqlite {
  /** Borra el archivo físico de un adjunto (lo inyecta la fachada). */
  eliminarArchivo?: EliminarArchivo;
}

export async function crearAlmacenSqlite(
  nombre = 'beantrust-offline.db',
  opciones: OpcionesAlmacenSqlite = {},
): Promise<OfflineStorage> {
  const eliminarArchivo: EliminarArchivo = opciones.eliminarArchivo ?? (async () => {});
  const db = await SQLite.openDatabaseAsync(nombre);

  // `Transaction` extiende `SQLiteDatabase`: el mismo helper sirve para `db` y
  // para el `txn` de una transacción exclusiva (nunca se mezclan ambos).
  type Ejecutor = Pick<SQLite.SQLiteDatabase, 'runAsync'>;

  async function upsertRecurso(
    ejecutor: Ejecutor,
    userId: string,
    resource: RecursoCache,
    resourceId: string,
    data: unknown,
  ): Promise<void> {
    await ejecutor.runAsync(UPSERT_RECURSO, [
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
      await upsertRecurso(db, userId, resource, resourceId, data);
    },

    async leerRecurso<T>(userId: string, resource: RecursoCache, resourceId: string) {
      const fila = await db.getFirstAsync<{ data_json: string }>(
        'select data_json from cached_resource where user_id = ? and resource = ? and resource_id = ?',
        [userId, resource, resourceId],
      );
      return fila ? (JSON.parse(fila.data_json) as T) : null;
    },

    async eliminarUsuario(userId) {
      const rutas: string[] = [];
      // Exclusiva: sin otra conexión intercalada que pueda dejar la limpieza a
      // medias (el usuario A y el B no deben cruzarse).
      await db.withExclusiveTransactionAsync(async (txn) => {
        const adjuntos = await txn.getAllAsync<{ local_path: string }>(
          'select local_path from attachments where user_id = ?',
          [userId],
        );
        rutas.push(...adjuntos.map((fila) => fila.local_path));
        await txn.runAsync('delete from cached_resource where user_id = ?', [userId]);
        await txn.runAsync('delete from sync_queue where user_id = ?', [userId]);
        await txn.runAsync('delete from attachments where user_id = ?', [userId]);
      });
      for (const ruta of rutas) await eliminarArchivo(ruta);
    },

    async guardarOptimista({ userId, recursos, operaciones, adjunto }: GuardarOptimistaArgs) {
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const recurso of recursos) {
          await upsertRecurso(txn, userId, recurso.resource, recurso.resourceId, recurso.data);
        }
        if (adjunto) {
          await txn.runAsync(INSERT_ADJUNTO, [
            adjunto.id,
            userId,
            adjunto.loteId,
            adjunto.localPath,
            adjunto.mime,
            adjunto.bytes,
            adjunto.sha256,
            null,
            'pendiente',
            new Date().toISOString(),
          ]);
        }
        for (const operacion of operaciones) {
          await txn.runAsync(INSERT_OPERACION, [
            operacion.id,
            userId,
            operacion.tipo,
            JSON.stringify(operacion),
            new Date().toISOString(),
          ]);
        }
      });
    },

    async guardarAdjunto(adjunto) {
      await db.runAsync(INSERT_ADJUNTO, [
        adjunto.id,
        adjunto.userId,
        adjunto.loteId,
        adjunto.localPath,
        adjunto.mime,
        adjunto.bytes,
        adjunto.sha256,
        adjunto.evidenciaJson,
        adjunto.estado,
        adjunto.createdAt,
      ]);
    },

    async leerAdjunto(userId, adjuntoId) {
      const fila = await db.getFirstAsync<FilaAdjunto>(
        'select * from attachments where user_id = ? and id = ?',
        [userId, adjuntoId],
      );
      return fila ? aAdjunto(fila) : null;
    },

    async marcarAdjuntoSubido(userId, adjuntoId, evidenciaJson) {
      await db.runAsync(
        "update attachments set evidencia_json = ?, estado = 'subido' where user_id = ? and id = ?",
        [evidenciaJson, userId, adjuntoId],
      );
    },

    async eliminarAdjunto(userId, adjuntoId) {
      const fila = await db.getFirstAsync<{ local_path: string }>(
        'select local_path from attachments where user_id = ? and id = ?',
        [userId, adjuntoId],
      );
      await db.runAsync('delete from attachments where user_id = ? and id = ?', [
        userId,
        adjuntoId,
      ]);
      if (fila) await eliminarArchivo(fila.local_path);
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
