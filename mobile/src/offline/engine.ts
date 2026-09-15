/**
 * Motor de sincronización FIFO (§7.5).
 *
 * Reglas:
 * - Una operación por llamada, en orden de `sequence`. La cola es **única**:
 *   `subir_evidencia` (local) y `registrar_cosecha`/`avanzar_estado` (sync)
 *   conviven, de modo que una cosecha nunca adelanta a su foto.
 * - Una sola ejecución en curso por usuario (single-flight): dos eventos de
 *   conectividad no envían la misma operación dos veces.
 * - `ok` → se borra de la cola. Al confirmarse la cosecha con evidencia, se
 *   borra también el archivo y la fila del adjunto.
 * - `conflicto` → se marca y se corta el FIFO (no reintento automático; el
 *   usuario decide reintentar o descartar).
 * - `error` de negocio o fallo de red → se conserva `pendiente` y se corta el
 *   FIFO para no arrastrar operaciones dependientes.
 * - Si la sesión cambia (logout/login) durante el flush, se termina en
 *   silencio: no se borra ni se envía nada más, y una operación pendiente de A
 *   nunca llega a iniciar con la sesión de B.
 */

import type { OperacionSync, ResultadoSync } from '@/src/api/sync';
import type { OfflineStorage } from '@/src/offline/storage';
import type {
  OperacionPendiente,
  OperacionSubirEvidencia,
  ResumenSync,
} from '@/src/offline/types';

/** Contexto de sesión activo: `epoch` cambia en cada login/logout. */
export interface ContextoSesion {
  userId: string;
  epoch: number;
}

/** Resultado de un flush, emitido para todos los disparadores (no solo el manual). */
export interface ResultadoFlush {
  userId: string;
  ok: number;
  errores: number;
  conflictos: number;
}

export interface MotorSync {
  enCurso(): boolean;
  flush(userId: string): Promise<ResumenSync>;
  reintentar(userId: string, sequence: number): Promise<ResumenSync>;
  descartar(userId: string, sequence: number): Promise<void>;
}

interface OpcionesMotor {
  storage: OfflineStorage;
  ejecutar: (operacion: OperacionSync) => Promise<ResultadoSync>;
  /** Sube una foto; su persistencia (`evidencia_json`) la resuelve la fachada. */
  subirAdjunto?: (operacion: OperacionSubirEvidencia) => Promise<ResultadoSync>;
  /** Contexto de sesión actual; se compara con el capturado al iniciar el flush. */
  contexto?: () => ContextoSesion;
  onFlush?: (resultado: ResultadoFlush) => void;
  onCambio?: () => void;
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : 'Error desconocido.';
}

export function crearMotor({
  storage,
  ejecutar,
  subirAdjunto,
  contexto,
  onFlush,
  onCambio,
}: OpcionesMotor): MotorSync {
  const enVuelo = new Map<string, Promise<ResumenSync>>();

  async function ejecutarOperacion(payload: OperacionPendiente): Promise<ResultadoSync> {
    if (payload.tipo === 'subir_evidencia') {
      if (!subirAdjunto) {
        return { id: payload.id, estado: 'error', detalle: 'Subida de evidencia no configurada.' };
      }
      return subirAdjunto(payload);
    }
    return ejecutar(payload);
  }

  async function drenar(userId: string): Promise<ResumenSync> {
    const resumen: ResumenSync = {
      enviadas: 0,
      ok: 0,
      conflictos: 0,
      errores: 0,
      pendientes: 0,
    };

    const inicial = contexto?.();
    const sesionVigente = (): boolean => {
      if (!contexto || !inicial) return true;
      const actual = contexto();
      return actual.userId === inicial.userId && actual.epoch === inicial.epoch;
    };

    const cola = await storage.listarCola(userId);
    // Fotos aún sin confirmar: una cosecha que las referencia no puede salir.
    const evidenciasPendientes = new Set(
      cola
        .filter((item) => item.payload.tipo === 'subir_evidencia')
        .map((item) => (item.payload as OperacionSubirEvidencia).adjunto_id),
    );

    for (const item of cola) {
      if (item.estado === 'conflicto') continue;
      // La sesión pudo cambiar mientras se listaba la cola.
      if (!sesionVigente()) break;

      // La foto de esta cosecha sigue en la cola (pendiente o en conflicto):
      // no se puede crear el lote con una `evidencia_id` que no existe aún.
      if (
        item.payload.tipo === 'registrar_cosecha' &&
        item.payload.evidencia_id &&
        evidenciasPendientes.has(item.payload.evidencia_id)
      ) {
        break;
      }

      let resultado: ResultadoSync;
      try {
        resultado = await ejecutarOperacion(item.payload);
      } catch (err) {
        // Sesión cambiada al volver del request: no tocar la cola ajena.
        if (!sesionVigente()) break;
        await storage.actualizarOperacion(item.sequence, {
          attempts: item.attempts + 1,
          lastError: mensaje(err),
        });
        resumen.errores += 1;
        break;
      }

      // La operación ya se envió con la sesión vigente; si cambió al volver,
      // se termina en silencio sin borrar ni enviar más.
      if (!sesionVigente()) break;

      resumen.enviadas += 1;
      if (resultado.estado === 'ok') {
        if (item.payload.tipo === 'subir_evidencia') {
          // Subida confirmada: la foto ya vive en el backend, pero el archivo
          // local se conserva hasta que el lote la referencie.
          evidenciasPendientes.delete(item.payload.adjunto_id);
        } else if (item.payload.tipo === 'registrar_cosecha' && item.payload.evidencia_id) {
          // Lote creado: la evidencia ya es del backend, se puede soltar disco.
          await storage.eliminarAdjunto(userId, item.payload.evidencia_id);
        }
        await storage.eliminarOperacion(item.sequence);
        resumen.ok += 1;
        continue;
      }

      await storage.actualizarOperacion(item.sequence, {
        estado: resultado.estado === 'conflicto' ? 'conflicto' : item.estado,
        attempts: item.attempts + 1,
        lastError: resultado.detalle,
      });
      if (resultado.estado === 'conflicto') resumen.conflictos += 1;
      else resumen.errores += 1;
      break;
    }

    if (sesionVigente()) {
      resumen.pendientes = (await storage.listarCola(userId)).filter(
        (item) => item.estado === 'pendiente',
      ).length;
    }
    onFlush?.({
      userId,
      ok: resumen.ok,
      errores: resumen.errores,
      conflictos: resumen.conflictos,
    });
    onCambio?.();
    return resumen;
  }

  function flush(userId: string): Promise<ResumenSync> {
    const actual = enVuelo.get(userId);
    if (actual) return actual;
    const promesa = drenar(userId).finally(() => {
      enVuelo.delete(userId);
    });
    enVuelo.set(userId, promesa);
    return promesa;
  }

  return {
    enCurso: () => enVuelo.size > 0,

    flush,

    async reintentar(userId, sequence) {
      await storage.actualizarOperacion(sequence, {
        estado: 'pendiente',
        attempts: 0,
        lastError: null,
      });
      return flush(userId);
    },

    /**
     * Descarta una operación y su pareja de evidencia. Si la operación es una
     * foto, arrastra la cosecha que la referencia; si es una cosecha con foto,
     * arrastra la subida. En ambos casos se borra el adjunto (fila + archivo).
     */
    async descartar(userId, sequence) {
      const cola = await storage.listarCola(userId);
      const objetivo = cola.find((item) => item.sequence === sequence);
      if (!objetivo) return;

      const aEliminar = new Set<number>([objetivo.sequence]);
      let adjuntoId: string | null = null;

      if (objetivo.payload.tipo === 'subir_evidencia') {
        adjuntoId = objetivo.payload.adjunto_id;
        for (const item of cola) {
          if (
            item.payload.tipo === 'registrar_cosecha' &&
            item.payload.evidencia_id === adjuntoId
          ) {
            aEliminar.add(item.sequence);
          }
        }
      } else if (objetivo.payload.tipo === 'registrar_cosecha' && objetivo.payload.evidencia_id) {
        adjuntoId = objetivo.payload.evidencia_id;
        for (const item of cola) {
          if (item.payload.tipo === 'subir_evidencia' && item.payload.adjunto_id === adjuntoId) {
            aEliminar.add(item.sequence);
          }
        }
      }

      for (const seq of aEliminar) await storage.eliminarOperacion(seq);
      if (adjuntoId) await storage.eliminarAdjunto(userId, adjuntoId);
      onCambio?.();
    },
  };
}
