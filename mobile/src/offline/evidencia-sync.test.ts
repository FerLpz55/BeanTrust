/**
 * §7.5 / ADR-14 · Evidencia en la cola offline.
 *
 * Verifica el ciclo completo del motor con una sola cola: `subir_evidencia`
 * antes de `registrar_cosecha`, conservación de archivo/operaciones ante red
 * caída o conflicto, borrado del archivo al confirmar el lote, limpieza al
 * descartar y cancelación al cambiar de sesión.
 */

import { describe, expect, it } from 'vitest';

import type { OperacionSync, ResultadoSync } from '@/src/api/sync';
import type { AdjuntoLocal } from '@/src/evidencia/types';
import { crearMotor, type ContextoSesion } from '@/src/offline/engine';
import { crearAlmacenMemoria } from '@/src/offline/memory';
import type { OfflineStorage } from '@/src/offline/storage';
import type { OperacionSubirEvidencia } from '@/src/offline/types';

const USER = 'usuario-1';
const LOTE = 'lote-1';
const FINCA = 'finca-1';

const ADJUNTO: AdjuntoLocal = {
  id: 'ev-1',
  loteId: LOTE,
  localPath: 'file:///documents/evidencia/usuario-1/lote-1/ev-1.jpg',
  mime: 'image/jpeg',
  bytes: 1234,
  sha256: 'a'.repeat(64),
};

function ok(op: { id: string }): ResultadoSync {
  return { id: op.id, estado: 'ok', detalle: null };
}

const OPERACION_EVIDENCIA: OperacionSubirEvidencia = {
  tipo: 'subir_evidencia',
  id: ADJUNTO.id,
  lote_id: LOTE,
  finca_id: FINCA,
  adjunto_id: ADJUNTO.id,
};

const OPERACION_COSECHA: OperacionSync = {
  tipo: 'registrar_cosecha',
  id: LOTE,
  finca_id: FINCA,
  fecha_cosecha: '2026-08-01',
  peso_kg: 10,
  evidencia_id: ADJUNTO.id,
};

async function encolarConFoto(storage: OfflineStorage, userId = USER): Promise<void> {
  await storage.guardarOptimista({
    userId,
    recursos: [],
    operaciones: [OPERACION_EVIDENCIA, OPERACION_COSECHA],
    adjunto: ADJUNTO,
  });
}

interface Harness {
  storage: OfflineStorage;
  motor: ReturnType<typeof crearMotor>;
  orden: string[];
  archivosBorrados: string[];
}

function crearHarness(opciones: {
  subir?: (op: OperacionSubirEvidencia, storage: OfflineStorage) => Promise<ResultadoSync>;
  ejecutar?: (op: OperacionSync, storage: OfflineStorage) => Promise<ResultadoSync>;
  contexto?: () => ContextoSesion;
} = {}): Harness {
  const orden: string[] = [];
  const archivosBorrados: string[] = [];
  const storage = crearAlmacenMemoria({
    eliminarArchivo: async (path) => {
      archivosBorrados.push(path);
    },
  });

  const subir =
    opciones.subir ??
    (async (op: OperacionSubirEvidencia) => {
      orden.push('subir_evidencia');
      return ok(op);
    });
  const ejecutar =
    opciones.ejecutar ??
    (async (op: OperacionSync) => {
      orden.push(`sync:${op.tipo}`);
      return ok(op);
    });

  const motor = crearMotor({
    storage,
    contexto: opciones.contexto,
    ejecutar: (op) => ejecutar(op, storage),
    subirAdjunto: (op) => subir(op, storage),
  });

  return { storage, motor, orden, archivosBorrados };
}

describe('evidencia en la cola FIFO', () => {
  it('sube la foto antes de registrar la cosecha y vacía la cola', async () => {
    const { storage, motor, orden } = crearHarness();
    await encolarConFoto(storage);

    const resumen = await motor.flush(USER);

    expect(orden).toEqual(['subir_evidencia', 'sync:registrar_cosecha']);
    expect(resumen).toMatchObject({ ok: 2, pendientes: 0 });
    await expect(storage.listarCola(USER)).resolves.toHaveLength(0);
  });

  it('con red caída conserva el archivo y las dos operaciones', async () => {
    const { storage, motor, orden } = crearHarness({
      subir: async () => {
        throw new Error('sin red');
      },
    });
    await encolarConFoto(storage);

    const resumen = await motor.flush(USER);

    expect(resumen.errores).toBe(1);
    // La cosecha nunca se intenta mientras la foto no suba.
    expect(orden).toEqual([]);
    const cola = await storage.listarCola(USER);
    expect(cola.map((item) => [item.operationId, item.estado, item.attempts])).toEqual([
      ['ev-1', 'pendiente', 1],
      [LOTE, 'pendiente', 0],
    ]);
    await expect(storage.leerAdjunto(USER, ADJUNTO.id)).resolves.toMatchObject({
      localPath: ADJUNTO.localPath,
    });
  });

  it('un reinicio (nuevo motor) conserva attachment y cola', async () => {
    const storage = crearAlmacenMemoria({ eliminarArchivo: async () => {} });
    await encolarConFoto(storage);

    // "Reinicio": se descarta el motor y se crea otro sobre el mismo almacén.
    const motor = crearMotor({
      storage,
      ejecutar: async (op) => ok(op),
      subirAdjunto: async (op) => ok(op),
    });

    await expect(storage.leerAdjunto(USER, ADJUNTO.id)).resolves.not.toBeNull();
    await expect(storage.listarCola(USER)).resolves.toHaveLength(2);

    const resumen = await motor.flush(USER);
    expect(resumen.ok).toBe(2);
    await expect(storage.listarCola(USER)).resolves.toHaveLength(0);
  });

  it('subida exitosa conserva el archivo hasta que el lote se crea', async () => {
    const { storage, motor, archivosBorrados } = crearHarness({
      subir: async (op, store) => {
        await store.marcarAdjuntoSubido(USER, op.adjunto_id, JSON.stringify(ok(op)));
        return ok(op);
      },
      ejecutar: async (op) => ({ id: op.id, estado: 'error', detalle: 'datos inválidos' }),
    });
    await encolarConFoto(storage);

    const resumen = await motor.flush(USER);

    expect(resumen.ok).toBe(1);
    expect(resumen.errores).toBe(1);
    const cola = await storage.listarCola(USER);
    expect(cola.map((item) => item.operationId)).toEqual([LOTE]);
    expect(archivosBorrados).toHaveLength(0);
    await expect(storage.leerAdjunto(USER, ADJUNTO.id)).resolves.toMatchObject({
      estado: 'subido',
    });
  });

  it('lote confirmado borra el archivo y la fila del adjunto', async () => {
    const { storage, motor, archivosBorrados } = crearHarness();
    await encolarConFoto(storage);

    await motor.flush(USER);

    expect(archivosBorrados).toEqual([ADJUNTO.localPath]);
    await expect(storage.leerAdjunto(USER, ADJUNTO.id)).resolves.toBeNull();
    await expect(storage.listarCola(USER)).resolves.toHaveLength(0);
  });

  it('un conflicto de subida conserva el archivo y frena la cosecha', async () => {
    const { storage, motor, orden } = crearHarness({
      subir: async (op) => ({ id: op.id, estado: 'conflicto', detalle: 'imagen inválida' }),
    });
    await encolarConFoto(storage);

    const resumen = await motor.flush(USER);

    expect(resumen.conflictos).toBe(1);
    expect(orden).toEqual([]);
    const cola = await storage.listarCola(USER);
    expect(cola.map((item) => [item.operationId, item.estado])).toEqual([
      ['ev-1', 'conflicto'],
      [LOTE, 'pendiente'],
    ]);
    await expect(storage.leerAdjunto(USER, ADJUNTO.id)).resolves.not.toBeNull();
  });

  it('no envía la cosecha si la foto sigue en conflicto en la cola', async () => {
    const { storage, motor, orden } = crearHarness();
    await encolarConFoto(storage);

    // Se fuerza el conflicto de la evidencia directamente en la cola.
    const cola = await storage.listarCola(USER);
    await storage.actualizarOperacion(cola[0].sequence, { estado: 'conflicto' });

    await motor.flush(USER);

    expect(orden).toEqual([]);
    const despues = await storage.listarCola(USER);
    expect(despues.map((item) => item.operationId)).toEqual(['ev-1', LOTE]);
  });

  it('descartar la subida limpia ambas operaciones y el archivo', async () => {
    const { storage, motor, archivosBorrados } = crearHarness();
    await encolarConFoto(storage);
    const cola = await storage.listarCola(USER);
    const evidencia = cola.find((item) => item.operationId === ADJUNTO.id);

    await motor.descartar(USER, evidencia!.sequence);

    await expect(storage.listarCola(USER)).resolves.toHaveLength(0);
    await expect(storage.leerAdjunto(USER, ADJUNTO.id)).resolves.toBeNull();
    expect(archivosBorrados).toEqual([ADJUNTO.localPath]);
  });

  it('descartar la cosecha también elimina su foto', async () => {
    const { storage, motor, archivosBorrados } = crearHarness();
    await encolarConFoto(storage);
    const cola = await storage.listarCola(USER);
    const cosecha = cola.find((item) => item.operationId === LOTE);

    await motor.descartar(USER, cosecha!.sequence);

    await expect(storage.listarCola(USER)).resolves.toHaveLength(0);
    await expect(storage.leerAdjunto(USER, ADJUNTO.id)).resolves.toBeNull();
    expect(archivosBorrados).toEqual([ADJUNTO.localPath]);
  });

  it('si la sesión cambia, no sincroniza ni borra evidencia ajena', async () => {
    const storage = crearAlmacenMemoria({ eliminarArchivo: async () => {} });
    let contexto: ContextoSesion = { userId: USER, epoch: 1 };
    const motor = crearMotor({
      storage,
      contexto: () => contexto,
      ejecutar: async (op) => ok(op),
      subirAdjunto: async (op) => {
        // Al volver del request entra otra sesión (logout/login).
        contexto = { userId: 'otro', epoch: 2 };
        return ok(op);
      },
    });
    await encolarConFoto(storage);

    const resumen = await motor.flush(USER);

    expect(resumen.ok).toBe(0);
    const cola = await storage.listarCola(USER);
    expect(cola.map((item) => item.operationId)).toEqual(['ev-1', LOTE]);
    await expect(storage.leerAdjunto(USER, ADJUNTO.id)).resolves.not.toBeNull();
  });
});
