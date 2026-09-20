/**
 * Perfil del usuario autenticado (F08).
 *
 * Sustituye el mock fijo por datos reales: la identidad sale de
 * `GET /v1/auth/me` (vía el store de auth) y las fincas de `GET /v1/fincas`
 * (B15). El alta inicial de finca (onboarding) pasa por `crearFinca`.
 *
 * `cargado` distingue "sin fincas" de "no se pudo consultar": un error de red
 * nunca debe abrir el onboarding ni inventar que la cuenta está vacía.
 */

import { create } from 'zustand';

import { ApiError, SesionCambiadaError } from '@/src/api/client';
import { crearFinca as crearFincaApi, listarFincas, type FincaCreate } from '@/src/api/fincas';
import type { FincaRead } from '@/src/api/types';
import * as offline from '@/src/offline';
import { useAuthStore } from '@/src/store/auth';
import { registrarLimpiezaSesion } from '@/src/store/sesion';

interface PerfilState {
  fincas: FincaRead[];
  isLoading: boolean;
  /** True solo si el directorio se resolvió (o hay caché con fincas). */
  cargado: boolean;
  error: string | null;
  cargarFincas: () => Promise<void>;
  crearFinca: (datos: FincaCreate) => Promise<FincaRead>;
  /** Finca por defecto para el alta de lote (F10). */
  fincaPorDefecto: () => FincaRead | null;
  reset: () => void;
}

const ESTADO_INICIAL = {
  fincas: [] as FincaRead[],
  isLoading: false,
  cargado: false,
  error: null as string | null,
};

export const usePerfilStore = create<PerfilState>((set, get) => ({
  ...ESTADO_INICIAL,

  cargarFincas: async () => {
    set({ isLoading: true, error: null });
    const userId = useAuthStore.getState().usuarioId;
    try {
      const fincas = await listarFincas();
      set({ fincas, isLoading: false, cargado: true });
      // Caché para el modo campo: solo respuestas ya autorizadas del usuario.
      if (userId) await offline.guardarRecurso(userId, 'fincas', 'all', fincas);
    } catch (err) {
      // Respuesta de una sesión anterior: se descarta sin tocar el estado.
      if (err instanceof SesionCambiadaError) return;
      // 403 es esperado para el rol comprador (no tiene fincas, matriz §10).
      const esSinAcceso = err instanceof ApiError && err.status === 403;
      const sinRed = err instanceof ApiError && err.status === 0;
      const cacheadas =
        sinRed && userId
          ? await offline.leerRecurso<FincaRead[]>(userId, 'fincas', 'all')
          : null;
      const hayCache = Boolean(cacheadas && cacheadas.length > 0);
      set({
        fincas: cacheadas ?? [],
        isLoading: false,
        // Un fallo de red sin caché deja `cargado=false`: la UI ofrece reintento,
        // nunca interpreta el error como "cuenta sin finca".
        cargado: esSinAcceso || hayCache,
        error: esSinAcceso || hayCache ? null : 'No se pudieron cargar tus fincas.',
      });
    }
  },

  crearFinca: async (datos) => {
    const finca = await crearFincaApi(datos);
    await get().cargarFincas();
    return finca;
  },

  fincaPorDefecto: () => get().fincas[0] ?? null,

  reset: () => set(ESTADO_INICIAL),
}));

registrarLimpiezaSesion(() => {
  usePerfilStore.getState().reset();
});
