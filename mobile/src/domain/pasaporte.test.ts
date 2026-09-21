import { describe, expect, it } from 'vitest';

import { esCargaInicialPasaporte } from './pasaporte';

describe('esCargaInicialPasaporte', () => {
  it('nunca muestra el loader si ya hay datos (refresco/polling)', () => {
    expect(esCargaInicialPasaporte(true, true, false)).toBe(false);
    expect(esCargaInicialPasaporte(true, true, true)).toBe(false);
    expect(esCargaInicialPasaporte(true, false, false)).toBe(false);
  });

  it('muestra el loader en la carga inicial (sin datos, sin error)', () => {
    expect(esCargaInicialPasaporte(false, true, false)).toBe(true);
    expect(esCargaInicialPasaporte(false, false, false)).toBe(true);
  });

  it('no muestra el loader si hay error y no hay datos (pantalla de error)', () => {
    expect(esCargaInicialPasaporte(false, false, true)).toBe(false);
  });
});
