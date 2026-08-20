/** Stub de store verificar — reemplazar con implementación real (F03). */

import { create } from 'zustand';

interface VerificarData {
  lote: {
    codigo_publico: string;
    variedad: string;
    metodo_beneficiado: string;
    peso_actual_kg: number;
    fecha_cosecha: string;
    estado: string;
    hash_sha256: string;
    emitido_en: string;
  };
  historial: Array<{ etapa: string; hash: string; fecha: string }>;
}

interface VerificarState {
  data: VerificarData | null;
  isLoading: boolean;
}

export const useVerificarStore = create<VerificarState>(() => ({
  data: {
    lote: {
      codigo_publico: 'BTR-2024-0042',
      variedad: 'Geisha',
      metodo_beneficiado: 'Lavado',
      peso_actual_kg: 120.5,
      fecha_cosecha: '2026-08-10T08:00:00Z',
      estado: 'TOSTADO',
      hash_sha256: '0x7a3f8e9d2c1b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0',
      emitido_en: '2026-08-20T10:00:00Z',
    },
    historial: [
      { etapa: 'Cereza', hash: '0xabc123...', fecha: '2026-08-10' },
      { etapa: 'Pergamino', hash: '0xdef456...', fecha: '2026-08-12' },
      { etapa: 'Oro', hash: '0xghi789...', fecha: '2026-08-15' },
    ],
  },
  isLoading: false,
}));
