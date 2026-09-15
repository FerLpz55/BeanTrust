/** §7.5 · Los mensajes offline no deben afirmar confirmación del backend. */

import { describe, expect, it } from 'vitest';

import {
  detalleCosecha,
  detalleEvento,
  tituloCosecha,
  tituloEvento,
} from '@/src/domain/mensajes';

describe('mensajes de confirmación', () => {
  it('cosecha pendiente: guardada en el dispositivo, no confirmada', () => {
    expect(tituloCosecha(true)).toMatch(/dispositivo/i);
    expect(detalleCosecha(true)).toMatch(/pendiente de sincronizar/i);
    expect(detalleCosecha(true)).not.toMatch(/exitosamente/i);
  });

  it('cosecha confirmada: registrada exitosamente', () => {
    expect(tituloCosecha(false)).toMatch(/lote registrado/i);
    expect(detalleCosecha(false)).toMatch(/exitosamente/i);
  });

  it('evento pendiente: guardado en el dispositivo con el tipo', () => {
    expect(tituloEvento(true)).toMatch(/dispositivo/i);
    expect(detalleEvento('TOSTADO', true)).toContain('TOSTADO');
    expect(detalleEvento('TOSTADO', true)).toMatch(/pendiente de sincronizar/i);
  });

  it('evento confirmado: queda en la trazabilidad con hash', () => {
    expect(tituloEvento(false)).toMatch(/evento registrado/i);
    expect(detalleEvento('TOSTADO', false)).toMatch(/hash/i);
  });
});
