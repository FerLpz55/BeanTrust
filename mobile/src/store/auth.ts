/**
 * Estado de autenticación (Zustand). La sesión vive en SecureStore;
 * aquí solo el espejo en memoria para la UI.
 *
 * Además registra en `api/client` los hooks de sesión, para que cualquier
 * petición pueda renovar el token ante un 401 sin acoplar las capas.
 *
 * Sesión offline: un fallo de red al refrescar NO borra la sesión ni la
 * identidad cacheada (`usuarioId`/`rol`). Solo se limpia ante un refresh
 * inválido (401) o un logout explícito.
 */

import { create } from 'zustand';

import * as api from '@/src/api/auth';
import { ApiError, configurarSesion } from '@/src/api/client';
import type { Rol } from '@/src/api/types';
import { clearSession, readSession, saveSession } from '@/src/storage/secure';
import { ejecutarLimpiezasSesion } from '@/src/store/sesion';
import { decodeJwt, isTokenExpired } from '@/src/utils/jwt';

export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  /** Rol real resuelto por `GET /v1/auth/me` (nunca del claim del JWT). */
  rol: Rol | null;
  usuarioId: string | null;
  /** Generación de sesión: cambia en login/logout para descartar respuestas viejas. */
  generacion: number;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, nombre: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
  cargarPerfil: () => Promise<void>;
}

const SIN_SESION = {
  status: 'unauthenticated' as const,
  accessToken: null,
  refreshToken: null,
  email: null,
  rol: null,
  usuarioId: null,
};

/**
 * Las limpiezas de sesión (lotes, perfil, mercado, offline...) viven en
 * `store/sesion` y las ejecuta `logout` para que ninguna cuenta vea datos de la
 * anterior.
 */
function esFalloDeRed(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...SIN_SESION,
  status: 'restoring',
  generacion: 0,
  error: null,

  /** Resuelve el rol real en el backend; sin él la UI no puede filtrar por rol. */
  cargarPerfil: async () => {
    try {
      const perfil = await api.me();
      const { accessToken, refreshToken, email } = get();
      await saveSession({
        accessToken,
        refreshToken,
        email: perfil.email ?? email,
        usuarioId: perfil.id,
        rol: perfil.rol,
      });
      set({ rol: perfil.rol, usuarioId: perfil.id, email: perfil.email ?? email });
    } catch {
      // Un fallo aquí no debe cerrar la sesión: la UI degrada sin rol.
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const tokens = await api.login(email, password);
      const cuenta = decodeJwt(tokens.access_token)?.email ?? email;
      await saveSession({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email: cuenta,
        usuarioId: null,
        rol: null,
      });
      set({
        status: 'authenticated',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email: cuenta,
        generacion: get().generacion + 1,
        error: null,
      });
      await get().cargarPerfil();
      return true;
    } catch (err) {
      set({ error: err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.' });
      return false;
    }
  },

  register: async (email, password, nombre) => {
    set({ error: null });
    try {
      const tokens = await api.register(email, password, nombre);
      const cuenta = decodeJwt(tokens.access_token)?.email ?? email;
      await saveSession({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email: cuenta,
        usuarioId: null,
        rol: null,
      });
      set({
        status: 'authenticated',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email: cuenta,
        generacion: get().generacion + 1,
        error: null,
      });
      await get().cargarPerfil();
      return true;
    } catch (err) {
      const mensaje =
        err instanceof ApiError
          ? err.status === 401
            ? 'Ese correo ya está registrado o los datos no son válidos.'
            : err.message
          : 'No se pudo crear la cuenta.';
      set({ error: mensaje });
      return false;
    }
  },

  logout: async () => {
    const usuarioId = get().usuarioId;
    // Se invalida la sesión ANTES de limpiar: cualquier petición en vuelo de la
    // cuenta anterior se descarta al volver (generación distinta).
    set((s) => ({ generacion: s.generacion + 1 }));
    await ejecutarLimpiezasSesion(usuarioId);
    await clearSession();
    set({ ...SIN_SESION, error: null });
  },

  restore: async () => {
    const { accessToken, refreshToken, email, usuarioId, rol } = await readSession();
    if (!accessToken || !refreshToken) {
      set(SIN_SESION);
      return;
    }
    // Sesión establecida: nueva generación para descartar respuestas de la
    // ejecución anterior que pudieran llegar tarde.
    set((s) => ({ generacion: s.generacion + 1 }));
    if (!isTokenExpired(accessToken)) {
      set({
        status: 'authenticated',
        accessToken,
        refreshToken,
        email,
        usuarioId,
        rol: rol as Rol | null,
      });
      await get().cargarPerfil();
      return;
    }
    try {
      const tokens = await api.refresh(refreshToken);
      await saveSession({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email,
        usuarioId,
        rol,
      });
      set({
        status: 'authenticated',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email: email ?? decodeJwt(tokens.access_token)?.email ?? null,
        usuarioId,
        rol: rol as Rol | null,
      });
      await get().cargarPerfil();
    } catch (err) {
      if (esFalloDeRed(err)) {
        // Sin red: se conserva la sesión y la identidad cacheadas.
        set({
          status: 'authenticated',
          accessToken,
          refreshToken,
          email,
          usuarioId,
          rol: rol as Rol | null,
        });
        return;
      }
      await clearSession();
      set(SIN_SESION);
    }
  },
}));

/**
 * Puente con el cliente HTTP: permite renovar el access token ante un 401 en
 * cualquier pantalla, sin que `api/*` importe el store (evita el ciclo).
 *
 * Contrato: devuelve `null` si el refresh es inválido (la sesión debe
 * cerrarse); lanza `ApiError(0)` si fue un fallo de red (la sesión se conserva).
 */
configurarSesion({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getGeneracion: () => useAuthStore.getState().generacion,
  renovar: async () => {
    const { refreshToken, email, usuarioId, rol } = useAuthStore.getState();
    if (!refreshToken) return null;
    try {
      const tokens = await api.refresh(refreshToken);
      await saveSession({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email,
        usuarioId,
        rol,
      });
      useAuthStore.setState({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });
      return tokens.access_token;
    } catch (err) {
      if (esFalloDeRed(err)) throw err;
      return null;
    }
  },
  cerrarSesion: () => useAuthStore.getState().logout(),
});
