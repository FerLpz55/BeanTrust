/** §7.5 · Reacción a un flush: filtrado por sesión y refresco deduplicado. */

import { describe, expect, it, vi } from 'vitest';

import { crearCoordinadorFlush } from '@/src/offline/coordinador';

describe('coordinador de flush', () => {
  it('ignora resultados de una sesión que ya no es la actual', async () => {
    const onIntento = vi.fn();
    const refrescarFuentes = vi.fn(async () => {});
    const refrescarEstado = vi.fn(async () => {});
    const manejar = crearCoordinadorFlush({
      usuarioActual: () => 'B',
      onIntento,
      refrescarFuentes,
      refrescarEstado,
    });

    await manejar({ userId: 'A', ok: 1, errores: 0, conflictos: 0 });

    expect(onIntento).not.toHaveBeenCalled();
    expect(refrescarFuentes).not.toHaveBeenCalled();
    expect(refrescarEstado).not.toHaveBeenCalled();
  });

  it('refresca fuentes una sola vez con ok>0 y registra cada intento', async () => {
    let resolver: () => void = () => {};
    const onIntento = vi.fn();
    const refrescarFuentes = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolver = resolve;
        }),
    );
    const refrescarEstado = vi.fn(async () => {});
    const manejar = crearCoordinadorFlush({
      usuarioActual: () => 'A',
      onIntento,
      refrescarFuentes,
      refrescarEstado,
    });

    const primero = manejar({ userId: 'A', ok: 1, errores: 0, conflictos: 0 });
    const segundo = manejar({ userId: 'A', ok: 2, errores: 0, conflictos: 0 });
    resolver();
    await Promise.all([primero, segundo]);

    expect(refrescarFuentes).toHaveBeenCalledTimes(1);
    expect(onIntento).toHaveBeenCalledTimes(2);
    expect(refrescarEstado).toHaveBeenCalledTimes(2);
  });

  it('con ok=0 no refresca fuentes pero sí recalcula el estado', async () => {
    const refrescarFuentes = vi.fn(async () => {});
    const refrescarEstado = vi.fn(async () => {});
    const manejar = crearCoordinadorFlush({
      usuarioActual: () => 'A',
      onIntento: () => {},
      refrescarFuentes,
      refrescarEstado,
    });

    await manejar({ userId: 'A', ok: 0, errores: 1, conflictos: 0 });

    expect(refrescarFuentes).not.toHaveBeenCalled();
    expect(refrescarEstado).toHaveBeenCalledTimes(1);
  });
});
