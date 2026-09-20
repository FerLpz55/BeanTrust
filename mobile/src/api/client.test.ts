/**
 * F07 · Cliente HTTP: idempotencia, errores y renovación transparente ante 401.
 *
 * Es la lógica con más riesgo de la capa de API: un fallo aquí rompe todas las
 * pantallas a la vez (p.ej. el access token expira con la app abierta).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, SesionCambiadaError, apiRequest, configurarSesion } from './client';

const ok = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

function mockFetch() {
  const fn = vi.fn();
  vi.stubGlobal('fetch', fn);
  return fn;
}

function ultimaPeticion(fn: ReturnType<typeof mockFetch>, i = 0) {
  return fn.mock.calls[i][1] as RequestInit & { headers: Record<string, string> };
}

beforeEach(() => {
  configurarSesion({
    getAccessToken: () => 'token-viejo',
    renovar: async () => 'token-nuevo',
    cerrarSesion: async () => {},
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
  it('adjunta el token de sesión y devuelve el JSON', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(ok({ id: 'lote-1' }));

    const datos = await apiRequest<{ id: string }>('/v1/lotes/1');

    expect(datos).toEqual({ id: 'lote-1' });
    expect(ultimaPeticion(fetchMock).headers.Authorization).toBe('Bearer token-viejo');
  });

  it('envía Idempotency-Key cuando se pide', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(ok({}, 201));

    await apiRequest('/v1/propinas', {
      method: 'POST',
      body: { monto: 10 },
      idempotencyKey: 'clave-123',
    });

    expect(ultimaPeticion(fetchMock).headers['Idempotency-Key']).toBe('clave-123');
  });

  it('no manda Authorization en peticiones anónimas (verificar/ es público)', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(ok({ codigo: 'BT-1' }));

    await apiRequest('/v1/verificar/BT-1', { token: null });

    expect(ultimaPeticion(fetchMock).headers.Authorization).toBeUndefined();
  });

  it('ante 401 renueva el token y reintenta una sola vez', async () => {
    const fetchMock = mockFetch();
    fetchMock
      .mockResolvedValueOnce(ok({ detail: 'expirado' }, 401))
      .mockResolvedValueOnce(ok({ id: 'ok' }));

    const datos = await apiRequest<{ id: string }>('/v1/lotes');

    expect(datos).toEqual({ id: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ultimaPeticion(fetchMock, 1).headers.Authorization).toBe('Bearer token-nuevo');
  });

  it('si la renovación falla, cierra sesión y propaga el 401', async () => {
    const cerrarSesion = vi.fn(async () => {});
    configurarSesion({
      getAccessToken: () => 'token-viejo',
      renovar: async () => null,
      cerrarSesion,
    });
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(ok({ detail: 'no autorizado' }, 401));

    await expect(apiRequest('/v1/lotes')).rejects.toThrow(ApiError);
    expect(cerrarSesion).toHaveBeenCalledOnce();
  });

  it('no entra en bucle: un 401 tras renovar no vuelve a renovar', async () => {
    const renovar = vi.fn(async () => 'token-nuevo');
    configurarSesion({
      getAccessToken: () => 'token-viejo',
      renovar,
      cerrarSesion: async () => {},
    });
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(ok({ detail: 'sigue mal' }, 401));

    await expect(apiRequest('/v1/lotes')).rejects.toThrow(ApiError);
    expect(renovar).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('extrae el mensaje de un 422 de FastAPI (detail es una lista)', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(
      ok({ detail: [{ msg: 'El peso debe ser mayor que 0' }] }, 422)
    );

    await expect(apiRequest('/v1/lotes', { method: 'POST' })).rejects.toThrow(
      'El peso debe ser mayor que 0'
    );
  });

  it('traduce un fallo de red a un ApiError legible', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiRequest('/v1/lotes', { token: null })).rejects.toThrow(
      'No se pudo contactar el servidor.'
    );
  });

  it('descarta la respuesta si la sesión cambió mientras estaba en vuelo', async () => {
    let generacion = 1;
    configurarSesion({
      getAccessToken: () => 'token-viejo',
      renovar: async () => 'token-nuevo',
      cerrarSesion: async () => {},
      getGeneracion: () => generacion,
    });
    const fetchMock = mockFetch();
    fetchMock.mockImplementationOnce(async () => {
      generacion = 2; // login/logout ocurrió durante la petición
      return ok({ id: 'dato-viejo' });
    });

    await expect(apiRequest('/v1/lotes')).rejects.toBeInstanceOf(SesionCambiadaError);
  });
});
