/** API de fincas: alta idempotente (onboarding) y listado. */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { crearFinca, listarFincas } from './fincas';

const ok = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function mockFetch() {
  const fn = vi.fn();
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('fincas API', () => {
  it('crearFinca hace POST con Idempotency-Key igual al id', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(
      ok(
        {
          id: 'finca-1',
          nombre: 'Mi Finca',
          municipio: 'Coatepec',
          organica: false,
          altitud_min: 1100,
          altitud_max: 1300,
        },
        201
      )
    );

    const finca = await crearFinca({
      id: 'finca-1',
      nombre: 'Mi Finca',
      municipio: 'Coatepec',
      altitud_min: 1100,
      altitud_max: 1300,
    });

    expect(finca.id).toBe('finca-1');
    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toBe('finca-1');
    expect(JSON.parse(String(init.body))).toMatchObject({ id: 'finca-1', nombre: 'Mi Finca' });
  });

  it('listarFincas hace GET', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(ok([]));

    await listarFincas();

    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('GET');
  });
});
