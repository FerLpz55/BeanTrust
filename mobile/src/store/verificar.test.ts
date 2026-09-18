/**
 * ADR-11 · El Pasaporte conserva el bloque `anclaje_onchain` del backend,
 * incluidos `red_nombre` y `explorer_etiqueta` (sin hardcodear la red).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/src/api/client';
import { verificarCodigo } from '@/src/api/verificar';
import type { VerificarRead } from '@/src/api/types';
import { useVerificarStore } from '@/src/store/verificar';

vi.mock('@/src/api/verificar', () => ({ verificarCodigo: vi.fn() }));

function diferido<T>() {
  let resolve!: (valor: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const PASAPORTE: VerificarRead = {
  codigo: 'BT-1',
  lote_id: 'lote-1',
  estado: 'TOSTADO',
  fecha_cosecha: '2026-08-01',
  finca_id: 'finca-1',
  peso_actual_kg: 100,
  hash_sha256: 'a'.repeat(64),
  emitido_en: '2026-08-01T00:00:00Z',
  historial: [],
  variedad: null,
  metodo_beneficiado: null,
  altitud_min: null,
  altitud_max: null,
  humedad_final_pct: null,
  puntaje_sca: null,
  productor_nombre: null,
  finca_nombre: 'Finca',
  municipio: null,
  organica: null,
  anclaje_onchain: {
    estado: 'CONFIRMADA',
    chain_id: 84532,
    red_nombre: 'Base Sepolia',
    contrato: '0x' + 'ab'.repeat(20),
    tx_hash: '0x' + 'ab'.repeat(32),
    bloque: 123,
    hash_raiz: '0x' + 'cd'.repeat(32),
    explorer_url: 'https://sepolia.basescan.org/tx/0x' + 'ab'.repeat(32),
    explorer_etiqueta: 'BaseScan',
    confirmada_en: '2026-08-01T00:00:00Z',
  },
};

afterEach(() => useVerificarStore.getState().reset());

describe('verificar store · anclaje_onchain', () => {
  it('conserva red_nombre y explorer_etiqueta del backend', async () => {
    vi.mocked(verificarCodigo).mockResolvedValue(PASAPORTE);

    await useVerificarStore.getState().buscarPorCodigo('BT-1');

    const anclaje = useVerificarStore.getState().data?.pasaporte.anclaje_onchain;
    expect(anclaje?.estado).toBe('CONFIRMADA');
    expect(anclaje?.red_nombre).toBe('Base Sepolia');
    expect(anclaje?.explorer_etiqueta).toBe('BaseScan');
    expect(anclaje?.bloque).toBe(123);
  });

  it('acepta un pasaporte sin anclaje (web3 desactivado)', async () => {
    vi.mocked(verificarCodigo).mockResolvedValue({ ...PASAPORTE, anclaje_onchain: null });

    await useVerificarStore.getState().buscarPorCodigo('BT-1');

    expect(useVerificarStore.getState().data?.pasaporte.anclaje_onchain).toBeNull();
  });
});

describe('verificar store · concurrencia y errores', () => {
  it('una respuesta vieja no reemplaza a un pasaporte nuevo', async () => {
    const primero = diferido<VerificarRead>();
    const segundo = diferido<VerificarRead>();
    vi.mocked(verificarCodigo)
      .mockReturnValueOnce(primero.promise)
      .mockReturnValueOnce(segundo.promise);

    const p1 = useVerificarStore.getState().buscarPorCodigo('BT-1');
    const p2 = useVerificarStore.getState().buscarPorCodigo('BT-2');

    segundo.resolve({ ...PASAPORTE, codigo: 'BT-2' });
    await p2;
    primero.resolve({ ...PASAPORTE, codigo: 'BT-1' });
    await p1;

    expect(useVerificarStore.getState().data?.pasaporte.codigo).toBe('BT-2');
  });

  it('reset invalida una petición en vuelo', async () => {
    const pendiente = diferido<VerificarRead>();
    vi.mocked(verificarCodigo).mockReturnValueOnce(pendiente.promise);

    const p = useVerificarStore.getState().buscarPorCodigo('BT-1');
    useVerificarStore.getState().reset();
    pendiente.resolve(PASAPORTE);
    await p;

    expect(useVerificarStore.getState().data).toBeNull();
  });

  it('conserva el pasaporte visible durante una actualización', async () => {
    vi.mocked(verificarCodigo).mockResolvedValueOnce(PASAPORTE);
    await useVerificarStore.getState().buscarPorCodigo('BT-1');

    const pendiente = diferido<VerificarRead>();
    vi.mocked(verificarCodigo).mockReturnValueOnce(pendiente.promise);
    const p = useVerificarStore.getState().buscarPorCodigo('BT-1');

    expect(useVerificarStore.getState().data?.pasaporte.codigo).toBe('BT-1');
    expect(useVerificarStore.getState().isLoading).toBe(true);
    pendiente.resolve(PASAPORTE);
    await p;
  });

  it('distingue 404, 409 y error de red en título y mensaje', async () => {
    vi.mocked(verificarCodigo).mockRejectedValueOnce(new ApiError(404, 'no existe'));
    await useVerificarStore.getState().buscarPorCodigo('BT-1');
    expect(useVerificarStore.getState().tituloError).toBe('Lote no encontrado');
    expect(useVerificarStore.getState().motivo).toBe('no_encontrado');

    vi.mocked(verificarCodigo).mockRejectedValueOnce(new ApiError(409, 'manipulado'));
    await useVerificarStore.getState().buscarPorCodigo('BT-1');
    expect(useVerificarStore.getState().tituloError).toBe('Certificado no verificable');
    expect(useVerificarStore.getState().motivo).toBe('manipulado');

    vi.mocked(verificarCodigo).mockRejectedValueOnce(new ApiError(0, 'sin red'));
    await useVerificarStore.getState().buscarPorCodigo('BT-1');
    expect(useVerificarStore.getState().tituloError).toBe('Sin conexión');
    expect(useVerificarStore.getState().motivo).toBe('red');
  });
});
