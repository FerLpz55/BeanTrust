/** Tests del almacén en memoria: persistencia, aislamiento y cola (§7.5). */

import { describe, expect, it } from 'vitest';

import type { OperacionSync } from '@/src/api/sync';
import { crearAlmacenMemoria } from '@/src/offline/memory';

const USER_A = 'usuario-a';
const USER_B = 'usuario-b';

function cosecha(id: string, peso = 100): OperacionSync {
  return {
    tipo: 'registrar_cosecha',
    id,
    finca_id: 'finca-1',
    fecha_cosecha: '2026-08-01',
    peso_kg: peso,
  };
}

describe('almacén en memoria', () => {
  it('persiste y recupera recursos por usuario', async () => {
    const almacen = crearAlmacenMemoria();
    await almacen.guardarRecurso(USER_A, 'fincas', 'all', [{ id: 'f1' }]);
    await expect(almacen.leerRecurso(USER_A, 'fincas', 'all')).resolves.toEqual([{ id: 'f1' }]);
    await expect(almacen.leerRecurso(USER_A, 'fincas', 'otro')).resolves.toBeNull();
  });

  it('aísla los datos entre usuarios', async () => {
    const almacen = crearAlmacenMemoria();
    await almacen.guardarRecurso(USER_A, 'lotes', 'all', ['de-a']);
    await almacen.guardarRecurso(USER_B, 'lotes', 'all', ['de-b']);
    await expect(almacen.leerRecurso(USER_A, 'lotes', 'all')).resolves.toEqual(['de-a']);

    await almacen.eliminarUsuario(USER_A);
    await expect(almacen.leerRecurso(USER_A, 'lotes', 'all')).resolves.toBeNull();
    await expect(almacen.leerRecurso(USER_B, 'lotes', 'all')).resolves.toEqual(['de-b']);
  });

  it('guardarOptimista persiste recursos y encola sin duplicar la operación', async () => {
    const almacen = crearAlmacenMemoria();
    const args = {
      userId: USER_A,
      recursos: [{ resource: 'lotes' as const, resourceId: 'all', data: ['optimista'] }],
      operaciones: [cosecha('op-1')],
    };
    await almacen.guardarOptimista(args);
    await almacen.guardarOptimista(args);

    await expect(almacen.leerRecurso(USER_A, 'lotes', 'all')).resolves.toEqual(['optimista']);
    const cola = await almacen.listarCola(USER_A);
    expect(cola).toHaveLength(1);
    expect(cola[0]).toMatchObject({ operationId: 'op-1', estado: 'pendiente', attempts: 0 });
  });

  it('devuelve la cola en orden FIFO y respeta actualizar/eliminar', async () => {
    const almacen = crearAlmacenMemoria();
    await almacen.guardarOptimista({ userId: USER_A, recursos: [], operaciones: [cosecha('a')] });
    await almacen.guardarOptimista({ userId: USER_A, recursos: [], operaciones: [cosecha('b')] });
    await almacen.guardarOptimista({ userId: USER_A, recursos: [], operaciones: [cosecha('c')] });

    const cola = await almacen.listarCola(USER_A);
    expect(cola.map((item) => item.operationId)).toEqual(['a', 'b', 'c']);

    await almacen.actualizarOperacion(cola[1].sequence, {
      estado: 'conflicto',
      attempts: 2,
      lastError: 'no existe',
    });
    const actualizada = (await almacen.listarCola(USER_A))[1];
    expect(actualizada).toMatchObject({ estado: 'conflicto', attempts: 2, lastError: 'no existe' });

    await almacen.eliminarOperacion(cola[0].sequence);
    expect((await almacen.listarCola(USER_A)).map((item) => item.operationId)).toEqual(['b', 'c']);
  });
});
