/** Registro de limpiezas de sesión: aislamiento entre cuentas. */

import { describe, expect, it, vi } from 'vitest';

import { ejecutarLimpiezasSesion, registrarLimpiezaSesion } from './sesion';

describe('registro de limpiezas de sesión', () => {
  it('ejecuta cada limpieza con el usuario que sale', async () => {
    const primera = vi.fn();
    const segunda = vi.fn();
    registrarLimpiezaSesion(primera);
    registrarLimpiezaSesion(segunda);

    await ejecutarLimpiezasSesion('usuario-1');

    expect(primera).toHaveBeenCalledWith('usuario-1');
    expect(segunda).toHaveBeenCalledWith('usuario-1');
  });

  it('una limpieza que falla no impide ejecutar las demás', async () => {
    const falla = vi.fn(() => {
      throw new Error('boom');
    });
    const posterior = vi.fn();
    registrarLimpiezaSesion(falla);
    registrarLimpiezaSesion(posterior);

    await expect(ejecutarLimpiezasSesion(null)).resolves.toBeUndefined();
    expect(posterior).toHaveBeenCalled();
  });
});
