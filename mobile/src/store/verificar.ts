import { create } from 'zustand';

export interface VerificarLote {
  codigo_publico: string;
  variedad: string;
  metodo_beneficiado: string;
  peso_actual_kg: number;
  fecha_cosecha: string;
  estado: string;
  hash_sha256: string;
  emitido_en: string;
  altitud_min?: number;
  altitud_max?: number;
  humedad_final_pct?: number;
  puntaje_sca?: number;
  productor_nombre?: string;
  finca_nombre?: string;
  finca_municipio?: string;
}

export interface VerificarHistorial {
  etapa: string;
  hash: string;
  fecha: string;
  tipo: string;
  completed: boolean;
}

export interface VerificarData {
  lote: VerificarLote;
  historial: VerificarHistorial[];
}

export interface VerificarState {
  data: VerificarData | null;
  isLoading: boolean;
  error: string | null;
  buscarPorCodigo: (codigo: string) => void;
  reset: () => void;
}

const mockDatabase: Record<string, VerificarData> = {
  'BTR-2024-0042': {
    lote: {
      codigo_publico: 'BTR-2024-0042',
      variedad: 'Bourbon',
      metodo_beneficiado: 'Lavado',
      peso_actual_kg: 150.0,
      fecha_cosecha: '2024-01-15T08:00:00Z',
      estado: 'ORO',
      hash_sha256: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      emitido_en: '2024-02-10T14:30:00Z',
      finca_nombre: 'Finca El Roble',
      finca_municipio: 'Huehuetenango',
      altitud_min: 1450,
      altitud_max: 1620,
      puntaje_sca: 86,
      humedad_final_pct: 11.2,
    },
    historial: [
      { etapa: 'Cosecha Cereza', hash: '0x3c4d...', fecha: '2024-01-15T16:00:00Z', tipo: 'COSECHA', completed: true },
      { etapa: 'Despulpado y Lavado', hash: '0x5e6f...', fecha: '2024-01-16T10:00:00Z', tipo: 'BENEFICIO', completed: true },
      { etapa: 'Secado en Patio', hash: '0x7a8b...', fecha: '2024-01-25T12:00:00Z', tipo: 'SECADO', completed: true },
      { etapa: 'Trilla a Oro', hash: '0x9c0d...', fecha: '2024-02-10T09:00:00Z', tipo: 'TRILLA', completed: true },
    ],
  },
  'BTR-2024-0128': {
    lote: {
      codigo_publico: 'BTR-2024-0128',
      variedad: 'Typica',
      metodo_beneficiado: 'Natural',
      peso_actual_kg: 95.5,
      fecha_cosecha: '2024-02-05T08:00:00Z',
      estado: 'TOSTADO',
      hash_sha256: '0xf9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8',
      emitido_en: '2024-03-01T11:15:00Z',
      finca_nombre: 'Finca El Roble',
      altitud_min: 1550,
      altitud_max: 1700,
      puntaje_sca: 88,
      humedad_final_pct: 10.8,
    },
    historial: [
      { etapa: 'Cosecha Cereza', hash: '0xb5a4...', fecha: '2024-02-05T15:30:00Z', tipo: 'COSECHA', completed: true },
      { etapa: 'Secado Natural Camas Africanas', hash: '0xd1c0...', fecha: '2024-02-20T14:00:00Z', tipo: 'SECADO', completed: true },
      { etapa: 'Trilla a Oro', hash: '0xf7e6...', fecha: '2024-02-25T10:00:00Z', tipo: 'TRILLA', completed: true },
      { etapa: 'Tueste Medio', hash: '0xb3a2...', fecha: '2024-03-01T09:00:00Z', tipo: 'TUESTE', completed: true },
    ],
  },
};

export const useVerificarStore = create<VerificarState>((set) => ({
  data: null,
  isLoading: false,
  error: null,
  buscarPorCodigo: (codigo: string) => {
    set({ isLoading: true, error: null, data: null });
    
    // Simulate network delay
    setTimeout(() => {
      const found = mockDatabase[codigo.trim().toUpperCase()];
      if (found) {
        set({ isLoading: false, data: found, error: null });
      } else {
        set({ isLoading: false, data: null, error: 'Código no encontrado o inválido.' });
      }
    }, 500);
  },
  reset: () => set({ data: null, isLoading: false, error: null }),
}));
