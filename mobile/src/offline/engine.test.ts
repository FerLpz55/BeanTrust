/** Tests del motor de sincronización FIFO (§7.5). */

import { describe, expect, it } from 'vitest';

import type { OperacionSync, ResultadoSync } from '@/src/api/sync';
import { crearMotor } from '@/src/offline/engine';
import { crearAlmacenMemoria } from '@/src/offline/memory';
import type { OfflineStorage } from '@/src/offline/storage';

const USER = 'usuario-1';

function cosecha(id: string): OperacionSync {
  return {
    tipo: 'registrar_cosecha',
    id,
    finca_id: 'finca-1',
    fecha_cosecha: '2026-08-01',
    peso_kg: 100,
  };
}

function evento(id: string, loteId: string, tipo: 'DESPULPADO' | 'TOSTADO' = 'DESPULPADO'): OperacionSync {
  return { tipo: 'avanzar_estado', id, lote_id: loteId, evento: { tipo } };
}

async function encolar(storage: OfflineStorage, ops: OperacionSync[]): Promise<void> {
  for (const operacion of ops) {
    await storage.guardarOptimista({ userId: USER, recursos: [], operacion });
  }
}

function ok(op: OperacionSync): ResultadoSync {
  return { id: op.id, estado: 'ok', detalle: null };
}

describe('motor de sincronización', () => {
  it('envía en orden FIFO y borra las operaciones confirmadas', async () => {
    const storage = crearAlmacenMemoria();
    const enviadas: string[] = [];
    const motor = crearMotor({
      storage,
      ejecutar: async (op) => {
        enviadas.push(op.id);
        return ok(op);
      },
    });
    await encolar(storage, [cosecha('a'), evento('b', 'a'), evento('c', 'a', 'TOSTADO')]);

    const resumen = await motor.flush(USER);
    expect(enviadas).toEqual(['a', 'b', 'c']);
    expect(resumen).toMatchObject({ ok: 3, pendientes: 0 });
    await expect(storage.listarCola(USER)).resolves.toHaveLength(0);
  });

  it('no envía dos veces la misma operación (single-flight)', async () => {
    const storage = crearAlmacenMemoria();
    let llamadas = 0;
    const motor = crearMotor({
      storage,
      ejecutar: async (op) => {
        llamadas += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return ok(op);
      },
    });
    await encolar(storage, [cosecha('a')]);

    await Promise.all([motor.flush(USER), motor.flush(USER)]);
    expect(llamadas).toBe(1);
  });

  it('marca conflicto y corta el FIFO sin reintento automático', async () => {
    const storage = crearAlmacenMemoria();
    const ejecutadas: string[] = [];
    const motor = crearMotor({
      storage,
      ejecutar: async (op) => {
        ejecutadas.push(op.id);
        if (op.id === 'b') return { id: op.id, estado: 'conflicto', detalle: 'lote inexistente' };
        return ok(op);
      },
    });
    await encolar(storage, [cosecha('a'), evento('b', 'a'), evento('c', 'a', 'TOSTADO')]);

    const resumen = await motor.flush(USER);
    expect(ejecutadas).toEqual(['a', 'b']);
    expect(resumen.conflictos).toBe(1);

    const cola = await storage.listarCola(USER);
    expect(cola.map((item) => [item.operationId, item.estado])).toEqual([
      ['b', 'conflicto'],
      ['c', 'pendiente'],
    ]);
  });

  it('conserva pendiente un error de negocio y corta el FIFO', async () => {
    const storage = crearAlmacenMemoria();
    const motor = crearMotor({
      storage,
      ejecutar: async (op) =>
        op.id === 'b'
          ? { id: op.id, estado: 'error', detalle: 'datos inválidos' }
          : ok(op),
    });
    await encolar(storage, [cosecha('a'), evento('b', 'a'), evento('c', 'a', 'TOSTADO')]);

    const resumen = await motor.flush(USER);
    expect(resumen.errores).toBe(1);
    const cola = await storage.listarCola(USER);
    expect(cola.map((item) => [item.operationId, item.estado, item.attempts])).toEqual([
      ['b', 'pendiente', 1],
      ['c', 'pendiente', 0],
    ]);
  });

  it('conserva pendiente un fallo de red y corta el FIFO', async () => {
    const storage = crearAlmacenMemoria();
    const motor = crearMotor({
      storage,
      ejecutar: async (op) => {
        if (op.id === 'a') throw new Error('sin red');
        return ok(op);
      },
    });
    await encolar(storage, [cosecha('a'), evento('b', 'a')]);

    const resumen = await motor.flush(USER);
    expect(resumen.errores).toBe(1);
    const cola = await storage.listarCola(USER);
    expect(cola.map((item) => item.operationId)).toEqual(['a', 'b']);
    expect(cola[0]).toMatchObject({ estado: 'pendiente', attempts: 1, lastError: 'sin red' });
  });

  it('reintentar devuelve la operación a pendiente y la reenvía', async () => {
    const storage = crearAlmacenMemoria();
    let fallar = true;
    const motor = crearMotor({
      storage,
      ejecutar: async (op) => {
        if (fallar) {
          fallar = false;
          return { id: op.id, estado: 'conflicto', detalle: 'transición inválida' };
        }
        return ok(op);
      },
    });
    await encolar(storage, [cosecha('a')]);
    await motor.flush(USER);

    const [enConflicto] = await storage.listarCola(USER);
    expect(enConflicto.estado).toBe('conflicto');

    await motor.reintentar(USER, enConflicto.sequence);
    await expect(storage.listarCola(USER)).resolves.toHaveLength(0);
  });

  it('descartar elimina una operación conflictiva de la cola', async () => {
    const storage = crearAlmacenMemoria();
    const motor = crearMotor({
      storage,
      ejecutar: async (op) => ({ id: op.id, estado: 'conflicto', detalle: 'x' }),
    });
    await encolar(storage, [cosecha('a')]);
    await motor.flush(USER);

    const [enConflicto] = await storage.listarCola(USER);
    await motor.descartar(enConflicto.sequence);
    await expect(storage.listarCola(USER)).resolves.toHaveLength(0);
  });
});
