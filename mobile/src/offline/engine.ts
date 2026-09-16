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
  RegistroCola,
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
  /**
   * Descarta una operación concreta. Si es la cosecha de un lote (o su foto),
   * enruta al descarte del lote; en cualquier otro caso (un evento suelto, una
   * foto huérfana) elimina solo esa operación y su adjunto.
   */
  descartar(userId: string, sequence: number): Promise<void>;
  /**
   * Descarta **todas** las operaciones de un lote (cosecha, foto y eventos),
   * con sus adjuntos. Solo aplica si la cosecha sigue en la cola: un lote ya
   * confirmado por el servidor no arrastra historial.
   */
  descartarLote(userId: string, loteId: string): Promise<void>;
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

/** Lote al que pertenece una operación de la cola (la cosecha lo lleva en `id`). */
function loteDe(payload: OperacionPendiente): string {
  return payload.tipo === 'registrar_cosecha' ? payload.id : payload.lote_id;
}

/** Adjunto local referenciado por una operación, si aplica. */
function adjuntoDe(payload: OperacionPendiente): string | null {
  if (payload.tipo === 'subir_evidencia') return payload.adjunto_id;
  if (payload.tipo === 'registrar_cosecha') return payload.evidencia_id ?? null;
  return null;
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

  /**
   * Elimina una única operación y, si referencia un adjunto local, su fila y
   * archivo. Es el descarte "sin cascada".
   */
  async function descartarOperacion(userId: string, item: RegistroCola): Promise<void> {
    await storage.eliminarOperacion(item.sequence);
    const adjuntoId = adjuntoDe(item.payload);
    if (adjuntoId) await storage.eliminarAdjunto(userId, adjuntoId);
    onCambio?.();
  }

  /**
   * Cascada por lote: borra **todas** sus operaciones (cosecha, foto y eventos)
   * y los adjuntos referenciados. La regla de confirmación vive aquí: si el
   * `registrar_cosecha` del lote ya no está en la cola (el servidor lo
   * confirmó), no hay nada que descartar en cascada y devuelve `false` para que
   * el descarte individual decida.
   */
  async function cascadaLote(userId: string, loteId: string): Promise<boolean> {
    const cola = await storage.listarCola(userId);
    const cosechaEnCola = cola.some(
      (item) => item.payload.tipo === 'registrar_cosecha' && item.payload.id === loteId,
    );
    if (!cosechaEnCola) return false;

    const adjuntos = new Set<string>();
    for (const item of cola) {
      if (loteDe(item.payload) !== loteId) continue;
      await storage.eliminarOperacion(item.sequence);
      const adjuntoId = adjuntoDe(item.payload);
      if (adjuntoId) adjuntos.add(adjuntoId);
    }
    for (const adjuntoId of adjuntos) await storage.eliminarAdjunto(userId, adjuntoId);
    onCambio?.();
    return true;
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

    async descartar(userId, sequence) {
      const cola = await storage.listarCola(userId);
      const objetivo = cola.find((item) => item.sequence === sequence);
      if (!objetivo) return;

      // La cosecha y su foto son operaciones de lote: misma ruta que
      // `descartarLote`. Si el lote ya fue confirmado, la cascada no aplica y
      // se cae al descarte individual (foto huérfana o evento suelto).
      if (objetivo.payload.tipo === 'registrar_cosecha' || objetivo.payload.tipo === 'subir_evidencia') {
        const aplicada = await cascadaLote(userId, loteDe(objetivo.payload));
        if (aplicada) return;
      }

      await descartarOperacion(userId, objetivo);
    },

    async descartarLote(userId, loteId) {
      await cascadaLote(userId, loteId);
    },
  };
}
