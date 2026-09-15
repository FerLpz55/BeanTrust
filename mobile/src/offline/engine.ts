/**
 * Motor de sincronización FIFO (§7.5).
 *
 * Reglas:
 * - Una operación por llamada a `/v1/sync`, en orden de `sequence`.
 * - Una sola ejecución en curso por usuario (single-flight): dos eventos de
 *   conectividad no envían la misma operación dos veces.
 * - `ok` → se borra de la cola.
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
import type { ResumenSync } from '@/src/offline/types';

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
  descartar(sequence: number): Promise<void>;
}

interface OpcionesMotor {
  storage: OfflineStorage;
  ejecutar: (operacion: OperacionSync) => Promise<ResultadoSync>;
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
  contexto,
  onFlush,
  onCambio,
}: OpcionesMotor): MotorSync {
  const enVuelo = new Map<string, Promise<ResumenSync>>();

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

    for (const item of await storage.listarCola(userId)) {
      if (item.estado === 'conflicto') continue;
      // La sesión pudo cambiar mientras se listaba la cola.
      if (!sesionVigente()) break;

      let resultado: ResultadoSync;
      try {
        resultado = await ejecutar(item.payload);
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

    async descartar(sequence) {
      await storage.eliminarOperacion(sequence);
      onCambio?.();
    },
  };
}
