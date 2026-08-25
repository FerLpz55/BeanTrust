/**
 * Estado de autenticación (Zustand). La sesión vive en SecureStore;
 * aquí solo el espejo en memoria para la UI.
 *
 * Además registra en `api/client` los hooks de sesión, para que cualquier
 * petición pueda renovar el token ante un 401 sin acoplar las capas.
 */

import { create } from 'zustand';

import * as api from '@/src/api/auth';
import { ApiError, configurarSesion } from '@/src/api/client';
import type { Rol } from '@/src/api/types';
import { clearSession, readSession, saveSession } from '@/src/storage/secure';
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
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, nombre: string, rol: Rol) => Promise<boolean>;
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

export const useAuthStore = create<AuthState>((set, get) => ({
  ...SIN_SESION,
  status: 'restoring',
  error: null,

  /** Resuelve el rol real en el backend; sin él la UI no puede filtrar por rol. */
  cargarPerfil: async () => {
    try {
      const perfil = await api.me();
      set({ rol: perfil.rol, usuarioId: perfil.id, email: perfil.email ?? get().email });
    } catch {
      // Un fallo aquí no debe cerrar la sesión: la UI degrada sin rol.
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const tokens = await api.login(email, password);
      const cuenta = decodeJwt(tokens.access_token)?.email ?? email;
      await saveSession(tokens.access_token, tokens.refresh_token, cuenta);
      set({
        status: 'authenticated',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email: cuenta,
        error: null,
      });
      await get().cargarPerfil();
      return true;
    } catch (err) {
      set({ error: err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.' });
      return false;
    }
  },

  register: async (email, password, nombre, rol) => {
    set({ error: null });
    try {
      const tokens = await api.register(email, password, nombre, rol);
      const cuenta = decodeJwt(tokens.access_token)?.email ?? email;
      await saveSession(tokens.access_token, tokens.refresh_token, cuenta);
      set({
        status: 'authenticated',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email: cuenta,
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
    await clearSession();
    set({ ...SIN_SESION, error: null });
  },

  restore: async () => {
    try {
      const { accessToken, refreshToken, email } = await readSession();
      if (!accessToken || !refreshToken) {
        set(SIN_SESION);
        return;
      }
      if (!isTokenExpired(accessToken)) {
        set({ status: 'authenticated', accessToken, refreshToken, email });
        await get().cargarPerfil();
        return;
      }
      const tokens = await api.refresh(refreshToken);
      await saveSession(tokens.access_token, tokens.refresh_token, email ?? '');
      set({
        status: 'authenticated',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email: email ?? decodeJwt(tokens.access_token)?.email ?? null,
      });
      await get().cargarPerfil();
    } catch {
      await clearSession();
      set(SIN_SESION);
    }
  },
}));

/**
 * Puente con el cliente HTTP: permite renovar el access token ante un 401 en
 * cualquier pantalla, sin que `api/*` importe el store (evita el ciclo).
 */
configurarSesion({
  getAccessToken: () => useAuthStore.getState().accessToken,
  renovar: async () => {
    const { refreshToken, email } = useAuthStore.getState();
    if (!refreshToken) return null;
    try {
      const tokens = await api.refresh(refreshToken);
      await saveSession(tokens.access_token, tokens.refresh_token, email ?? '');
      useAuthStore.setState({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });
      return tokens.access_token;
    } catch {
      return null;
    }
  },
  cerrarSesion: () => useAuthStore.getState().logout(),
});
