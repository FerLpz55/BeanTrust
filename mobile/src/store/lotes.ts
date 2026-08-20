/**
 * Estado de lotes (Zustand). Por ahora vive en memoria con mocks;
 * más adelante se conecta a Supabase + SQLite offline.
 */

import { create } from 'zustand';

export type LoteEstado =
  | 'CEREZA'
  | 'PERGAMINO'
  | 'ORO'
  | 'TOSTADO'
  | 'VENDIDO'
  | 'RECHAZADO';

export interface Lote {
  id: string;
  codigo: string;
  variedad: string;
  metodo: string;
  evidencia: string[]; // URLs de fotos
  hash_etapa: string;
  estado: LoteEstado;
  peso_actual_kg: number;
  fecha_cosecha: string; // ISO
  certificado: boolean;
}

interface LotesState {
  lotes: Lote[];
  isLoading: boolean;
  addLote: (lote: Omit<Lote, 'id' | 'codigo' | 'hash_etapa'>) => void;
}

// Datos iniciales de ejemplo para el dashboard
const MOCK_LOTES: Lote[] = [
  {
    id: 'lote-401',
    codigo: 'Lote #401',
    variedad: 'Bourbon',
    metodo: 'Lavado',
    evidencia: [],
    hash_etapa: '0x7a3f...e9d2',
    estado: 'ORO',
    peso_actual_kg: 120.5,
    fecha_cosecha: '2026-08-10T08:00:00Z',
    certificado: true,
  },
  {
    id: 'lote-402',
    codigo: 'Lote #402',
    variedad: 'Caturra',
    metodo: 'Natural',
    evidencia: [],
    hash_etapa: '0x9b2c...a1f4',
    estado: 'CEREZA',
    peso_actual_kg: 85.0,
    fecha_cosecha: '2026-08-15T10:30:00Z',
    certificado: false,
  },
  {
    id: 'lote-403',
    codigo: 'Lote #403',
    variedad: 'Typica',
    metodo: 'Honey',
    evidencia: [],
    hash_etapa: '0x3d1e...b7c8',
    estado: 'TOSTADO',
    peso_actual_kg: 45.2,
    fecha_cosecha: '2026-07-20T09:00:00Z',
    certificado: true,
  },
];

export const useLotesStore = create<LotesState>((set) => ({
  lotes: MOCK_LOTES,
  isLoading: false,
  addLote: (draft) =>
    set((state) => {
      const id = `lote-${Date.now()}`;
      const codigo = `Lote #${400 + state.lotes.length + 1}`;
      const hash = `0x${Math.random().toString(16).slice(2, 6)}...${Math.random().toString(16).slice(2, 6)}`;
      const lote: Lote = { ...draft, id, codigo, hash_etapa: hash };
      return { lotes: [lote, ...state.lotes] };
    }),
}));
