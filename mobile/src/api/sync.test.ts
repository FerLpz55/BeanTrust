/** §7.5 · `POST /v1/sync`: 202 (todo ok) y 207 (multi-status con conflictos). */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configurarSesion } from '@/src/api/client';
import { sincronizar, type OperacionSync } from '@/src/api/sync';

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const OPERACION: OperacionSync = {
  tipo: 'registrar_cosecha',
  id: 'op-1',
  finca_id: 'finca-1',
  fecha_cosecha: '2026-08-01',
  peso_kg: 10,
};

beforeEach(() => {
  configurarSesion({
    getAccessToken: () => 'token',
    renovar: async () => null,
    cerrarSesion: async () => {},
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('sincronizar', () => {
  it('acepta 202 y devuelve el resultado ok', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        respuesta({ resultados: [{ id: 'op-1', estado: 'ok', detalle: null }] }, 202),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { resultados } = await sincronizar([OPERACION]);

    expect(resultados).toEqual([{ id: 'op-1', estado: 'ok', detalle: null }]);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ operaciones: [OPERACION] });
  });

  it('acepta 207 y expone el conflicto por operación', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      respuesta(
        {
          resultados: [
            { id: 'op-1', estado: 'ok', detalle: null },
            { id: 'op-2', estado: 'conflicto', detalle: 'transición inválida' },
          ],
        },
        207,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { resultados } = await sincronizar([OPERACION]);

    expect(resultados[1]).toEqual({
      id: 'op-2',
      estado: 'conflicto',
      detalle: 'transición inválida',
    });
  });
});
