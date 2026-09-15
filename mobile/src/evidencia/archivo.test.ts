/**
 * ADR-14 · Captura y normalización de evidencia.
 *
 * Se mockean los módulos nativos de Expo (picker, manipulator, file-system,
 * crypto) para verificar el contrato de `archivo.ts` sin dispositivo: resize
 * proporcional, JPEG 0.82, copia a un directorio persistente y SHA-256 real.
 */

import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizarYGuardar, tomarFoto } from '@/src/evidencia/archivo';
import { useLoteDraft } from '@/src/store/lote-draft';

const mocks = vi.hoisted(() => ({
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  getPendingResultAsync: vi.fn(),
  manipulate: vi.fn(),
  resize: vi.fn(),
  renderAsync: vi.fn(),
  saveAsync: vi.fn(),
  crearDirectorio: vi.fn(),
  copiar: vi.fn(),
  bytes: vi.fn(),
  borrar: vi.fn(),
}));

vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: mocks.requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync: mocks.requestMediaLibraryPermissionsAsync,
  launchCameraAsync: mocks.launchCameraAsync,
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
  getPendingResultAsync: mocks.getPendingResultAsync,
}));

vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: mocks.manipulate },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

vi.mock('expo-file-system', () => {
  class MockDirectory {
    uri = 'file:///documents/evidencia';
    create = mocks.crearDirectorio;
  }
  class MockFile {
    uri: string;
    constructor(...args: unknown[]) {
      this.uri = args
        .map((arg) => (typeof arg === 'string' ? arg : ((arg as { uri?: string }).uri ?? '')))
        .join('/');
    }
    copy = mocks.copiar;
    bytes = mocks.bytes;
    delete = mocks.borrar;
    get exists() {
      return true;
    }
  }
  return { Paths: { document: new MockDirectory() }, Directory: MockDirectory, File: MockFile };
});

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: (_algoritmo: string, data: Uint8Array) =>
    globalThis.crypto.subtle.digest('SHA-256', data as BufferSource),
  randomUUID: () => '11111111-1111-4111-8111-111111111111',
}));

const BYTES = new Uint8Array([1, 2, 3, 4]);
const SHA_ESPERADO = createHash('sha256').update(Buffer.from(BYTES)).digest('hex');

const ASSET = {
  uri: 'file:///cache/input.heic',
  width: 4000,
  height: 3000,
  assetId: null,
  base64: null,
  duration: null,
  exif: null,
  fileName: 'input.heic',
  fileSize: 999,
  mimeType: 'image/heic',
  type: 'image' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  const contexto = { resize: mocks.resize, renderAsync: mocks.renderAsync };
  mocks.resize.mockReturnValue(contexto);
  mocks.manipulate.mockReturnValue(contexto);
  mocks.renderAsync.mockResolvedValue({ saveAsync: mocks.saveAsync });
  mocks.saveAsync.mockResolvedValue({
    uri: 'file:///cache/normalized.jpg',
    width: 2048,
    height: 1536,
  });
  mocks.bytes.mockResolvedValue(BYTES);
  mocks.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
  mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
});

describe('normalizarYGuardar', () => {
  it('normaliza a JPEG 0.82, limita a 2048 px y calcula SHA-256', async () => {
    const adjunto = await normalizarYGuardar(ASSET, 'lote-1', 'usuario-1');

    expect(mocks.manipulate).toHaveBeenCalledWith(ASSET.uri);
    // 4000x3000: se fija el lado mayor y el otro se calcula solo.
    expect(mocks.resize).toHaveBeenCalledWith({ width: 2048, height: null });
    expect(mocks.saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.82 });

    expect(adjunto).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      loteId: 'lote-1',
      mime: 'image/jpeg',
      bytes: 4,
    });
    expect(adjunto.sha256).toBe(SHA_ESPERADO);
  });

  it('copia el resultado a un directorio persistente (nunca cache)', async () => {
    const adjunto = await normalizarYGuardar(ASSET, 'lote-1', 'usuario-1');

    expect(mocks.crearDirectorio).toHaveBeenCalledWith({ intermediates: true, idempotent: true });
    expect(mocks.copiar).toHaveBeenCalledTimes(1);
    expect(adjunto.localPath).toContain('/documents/');
    expect(adjunto.localPath).not.toContain('/cache/');
  });
});

describe('captura', () => {
  it('cámara cancelada devuelve cancelado y no altera el borrador', async () => {
    mocks.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });

    const resultado = await tomarFoto();

    expect(resultado).toEqual({ estado: 'cancelado' });
    expect(useLoteDraft.getState().adjunto).toBeNull();
  });

  it('permiso denegado devuelve permiso_denegado y no altera el borrador', async () => {
    mocks.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });

    const resultado = await tomarFoto();

    expect(resultado).toEqual({ estado: 'permiso_denegado' });
    expect(mocks.launchCameraAsync).not.toHaveBeenCalled();
    expect(useLoteDraft.getState().adjunto).toBeNull();
  });
});
