/**
 * Coordinador de reacción a un flush (§7.5).
 *
 * El motor emite un `ResultadoFlush` para **todos** los disparadores (manual,
 * NetInfo, foreground e inicialización). Aquí se decide, de forma testeable:
 * - ignorar resultados de una sesión que ya no es la actual;
 * - refrescar lista/fincas **una sola vez** aunque lleguen varios resultados
 *   con `ok > 0` solapados;
 * - registrar el intento y recalcular el estado de la cola.
 */

import type { ResultadoFlush } from '@/src/offline/engine';

export interface DepsCoordinadorFlush {
  usuarioActual: () => string | null;
  onIntento: () => void;
  refrescarFuentes: () => Promise<void>;
  refrescarEstado: () => Promise<void>;
}

export function crearCoordinadorFlush(
  deps: DepsCoordinadorFlush,
): (resultado: ResultadoFlush) => Promise<void> {
  let refresco: Promise<void> | null = null;

  return async function manejarFlush(resultado: ResultadoFlush): Promise<void> {
    if (resultado.userId !== deps.usuarioActual()) return;

    deps.onIntento();

    if (resultado.ok > 0) {
      refresco ??= deps
        .refrescarFuentes()
        .catch(() => undefined)
        .finally(() => {
          refresco = null;
        });
      await refresco;
    }

    await deps.refrescarEstado();
  };
}
