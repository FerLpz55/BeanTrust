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
 */

import type { OperacionSync, ResultadoSync } from '@/src/api/sync';
import type { OfflineStorage } from '@/src/offline/storage';
import type { ResumenSync } from '@/src/offline/types';

export interface MotorSync {
  enCurso(): boolean;
  flush(userId: string): Promise<ResumenSync>;
  reintentar(userId: string, sequence: number): Promise<ResumenSync>;
  descartar(sequence: number): Promise<void>;
}

interface OpcionesMotor {
  storage: OfflineStorage;
  ejecutar: (operacion: OperacionSync) => Promise<ResultadoSync>;
  onCambio?: () => void;
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : 'Error desconocido.';
}

export function crearMotor({ storage, ejecutar, onCambio }: OpcionesMotor): MotorSync {
  const enVuelo = new Map<string, Promise<ResumenSync>>();

  async function drenar(userId: string): Promise<ResumenSync> {
    const resumen: ResumenSync = {
      enviadas: 0,
      ok: 0,
      conflictos: 0,
      errores: 0,
      pendientes: 0,
    };

    for (const item of await storage.listarCola(userId)) {
      if (item.estado === 'conflicto') continue;

      let resultado: ResultadoSync;
      try {
        resultado = await ejecutar(item.payload);
      } catch (err) {
        await storage.actualizarOperacion(item.sequence, {
          attempts: item.attempts + 1,
          lastError: mensaje(err),
        });
        resumen.errores += 1;
        break;
      }

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

    resumen.pendientes = (await storage.listarCola(userId)).filter(
      (item) => item.estado === 'pendiente',
    ).length;
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
