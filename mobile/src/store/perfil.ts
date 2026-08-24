/**
 * Perfil store for the logged-in user.
 */
import { create } from 'zustand';

export interface Finca {
  nombre: string;
  municipio: string;
  departamento: string;
  altitud_min: number;
  altitud_max: number;
  hectareas: number;
}

export interface Perfil {
  nombre: string;
  email: string;
  rol: 'productor' | 'cooperativa' | 'comprador' | 'admin';
  avatar_url?: string;
  finca?: Finca;
  fecha_registro: string;
  lotes_totales: number;
  certificados_emitidos: number;
}

interface PerfilState {
  perfil: Perfil;
  isLoading: boolean;
}

const mockPerfil: Perfil = {
  nombre: 'Carlos Mendoza',
  email: 'productor@beantrust.dev',
  rol: 'productor',
  finca: {
    nombre: 'Finca El Roble',
    municipio: 'Huehuetenango',
    departamento: 'Huehuetenango',
    altitud_min: 1450,
    altitud_max: 1620,
    hectareas: 12.5,
  },
  fecha_registro: '2024-01-15T00:00:00Z',
  lotes_totales: 6,
  certificados_emitidos: 3,
};

export const usePerfilStore = create<PerfilState>((set) => ({
  perfil: mockPerfil,
  isLoading: false,
}));
