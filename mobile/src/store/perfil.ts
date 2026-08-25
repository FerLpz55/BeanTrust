/**
 * Perfil del usuario autenticado (F08).
 *
 * Sustituye el mock fijo por datos reales: la identidad sale de
 * `GET /v1/auth/me` (vía el store de auth) y las fincas de `GET /v1/fincas`
 * (B15). No hay endpoint de "nombre de la persona" todavía: `/auth/me`
 * devuelve `id`, `rol` y `email`, así que la UI muestra el correo como
 * identidad hasta que el contrato exponga `nombre`.
 */

import { create } from 'zustand';

import { ApiError } from '@/src/api/client';
import { listarFincas } from '@/src/api/fincas';
import type { FincaRead } from '@/src/api/types';

interface PerfilState {
  fincas: FincaRead[];
  isLoading: boolean;
  error: string | null;
  cargarFincas: () => Promise<void>;
  /** Finca por defecto para el alta de lote (F10). */
  fincaPorDefecto: () => FincaRead | null;
}

export const usePerfilStore = create<PerfilState>((set, get) => ({
  fincas: [],
  isLoading: false,
  error: null,

  cargarFincas: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ fincas: await listarFincas(), isLoading: false });
    } catch (err) {
      // 403 es esperado para el rol comprador (no tiene fincas, matriz §10).
      const esSinAcceso = err instanceof ApiError && err.status === 403;
      set({
        fincas: [],
        isLoading: false,
        error: esSinAcceso ? null : 'No se pudieron cargar tus fincas.',
      });
    }
  },

  fincaPorDefecto: () => get().fincas[0] ?? null,
}));
