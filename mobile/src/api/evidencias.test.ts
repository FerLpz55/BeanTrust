/**
 * ADR-14 · Cliente de evidencia: multipart sin `Content-Type` manual,
 * idempotencia por header y URL firmada.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configurarSesion } from '@/src/api/client';
import { obtenerUrlEvidencia, subirEvidencia } from '@/src/api/evidencias';

const ok = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

function mockFetch() {
  const fn = vi.fn();
  vi.stubGlobal('fetch', fn);
  return fn;
}

function peticion(fn: ReturnType<typeof mockFetch>, i = 0) {
  return fn.mock.calls[i][1] as RequestInit & { headers: Record<string, string> };
}

const EVIDENCIA = {
  id: 'ev-1',
  lote_id: 'lote-1',
  finca_id: 'finca-1',
  evidencia_url: 'usuario-1/lote-1/ev-1.jpg',
  evidencia_sha256: 'a'.repeat(64),
  content_type: 'image/jpeg' as const,
  size_bytes: 1234,
  estado: 'PENDIENTE' as const,
};

beforeEach(() => {
  configurarSesion({
    getAccessToken: () => 'token',
    renovar: async () => null,
    cerrarSesion: async () => {},
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('subirEvidencia', () => {
  it('manda multipart, sin fijar Content-Type y con Idempotency-Key', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(ok(EVIDENCIA, 201));

    const resultado = await subirEvidencia({
      fincaId: 'finca-1',
      loteId: 'lote-1',
      localPath: 'file:///documents/evidencia/usuario-1/lote-1/ev-1.jpg',
      claveIdempotencia: 'ev-1',
    });

    expect(resultado).toEqual(EVIDENCIA);
    const init = peticion(fetchMock);
    expect(init.method).toBe('POST');
    // React Native crea el boundary: la app nunca fija Content-Type.
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.headers['Idempotency-Key']).toBe('ev-1');
    expect(init.headers.Authorization).toBe('Bearer token');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('finca_id')).toBe('finca-1');
    expect((init.body as FormData).get('lote_id')).toBe('lote-1');
  });

  it('propaga el error del backend como ApiError', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(
      ok({ detail: 'La imagen supera el tamaño máximo permitido.' }, 422),
    );

    await expect(
      subirEvidencia({
        fincaId: 'finca-1',
        loteId: 'lote-1',
        localPath: 'file:///documents/evidencia/ev-1.jpg',
        claveIdempotencia: 'ev-1',
      }),
    ).rejects.toThrow('La imagen supera el tamaño máximo permitido.');
  });
});

describe('obtenerUrlEvidencia', () => {
  it('pide la URL firmada del lote', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(
      ok({
        url: 'https://storage.example/evidencia.jpg?sig=abc',
        expira_en: '2026-09-15T12:00:00Z',
        evidencia_sha256: 'b'.repeat(64),
      }),
    );

    const resultado = await obtenerUrlEvidencia('lote-1');

    expect(resultado.url).toContain('https://');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/lotes/lote-1/evidencia');
  });
});
