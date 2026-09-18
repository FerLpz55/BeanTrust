import { describe, expect, it } from 'vitest';

import { debeConsultarAnclaje } from '@/src/domain/anclaje';
import { esUrlExplorerPermitida } from '@/src/utils/explorer';

const TX = '0x' + 'ab'.repeat(32);

describe('explorer · enlaces permitidos', () => {
  it('acepta HTTPS del host autorizado', () => {
    expect(esUrlExplorerPermitida(`https://sepolia.basescan.org/tx/${TX}`)).toBe(true);
  });

  it('rechaza otros hosts, HTTP y esquemas', () => {
    expect(esUrlExplorerPermitida(`https://basescan.org/tx/${TX}`)).toBe(false);
    expect(esUrlExplorerPermitida(`https://evil.example/tx/${TX}`)).toBe(false);
    expect(esUrlExplorerPermitida(`http://sepolia.basescan.org/tx/${TX}`)).toBe(false);
    expect(esUrlExplorerPermitida(`javascript:alert(1)`)).toBe(false);
    expect(esUrlExplorerPermitida(null)).toBe(false);
    expect(esUrlExplorerPermitida(undefined)).toBe(false);
  });

  it('rechaza un subdominio engañoso', () => {
    expect(esUrlExplorerPermitida(`https://sepolia.basescan.org.evil.com/tx/${TX}`)).toBe(false);
  });
});

describe('anclaje · polling', () => {
  it('consulta solo mientras el anclaje está en curso', () => {
    expect(debeConsultarAnclaje('PENDIENTE')).toBe(true);
    expect(debeConsultarAnclaje('ENVIANDO')).toBe(true);
    expect(debeConsultarAnclaje('ENVIADA')).toBe(true);
  });

  it('se detiene en estados finales o sin anclaje', () => {
    expect(debeConsultarAnclaje('CONFIRMADA')).toBe(false);
    expect(debeConsultarAnclaje('FALLIDA')).toBe(false);
    expect(debeConsultarAnclaje(null)).toBe(false);
    expect(debeConsultarAnclaje(undefined)).toBe(false);
  });
});
