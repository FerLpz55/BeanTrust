/**
 * Estado de autenticación (Zustand). La sesión vive en SecureStore;
 * aquí solo el espejo en memoria para la UI.
 */

import { create } from 'zustand';

import * as api from '@/src/api/auth';
import { ApiError } from '@/src/api/client';
import { clearSession, readSession, saveSession } from '@/src/storage/secure';
import { decodeJwt, isTokenExpired } from '@/src/utils/jwt';

export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'restoring',
  accessToken: null,
  refreshToken: null,
  email: null,
  error: null,

  login: async (email, password) => {
    set({ error: null });
    try {
      const tokens = await api.login(email, password);
      const payload = decodeJwt(tokens.access_token);
      const account = payload?.email ?? email;
      await saveSession(tokens.access_token, tokens.refresh_token, account);
      set({
        status: 'authenticated',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email: account,
        error: null,
      });
      return true;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.';
      set({ error: message });
      return false;
    }
  },

  logout: async () => {
    await clearSession();
    set({ status: 'unauthenticated', accessToken: null, refreshToken: null, email: null, error: null });
  },

  restore: async () => {
    console.log('[auth] restore: inicio');
    try {
      const { accessToken, refreshToken, email } = await readSession();
      if (!accessToken || !refreshToken) {
        console.log('[auth] restore: sin sesión → unauthenticated');
        set({ status: 'unauthenticated', accessToken: null, refreshToken: null, email: null });
        return;
      }
      if (!isTokenExpired(accessToken)) {
        console.log('[auth] restore: sesión válida');
        set({ status: 'authenticated', accessToken, refreshToken, email });
        return;
      }
      // Access expirado: intenta renovar con el refresh token.
      try {
        const tokens = await api.refresh(refreshToken);
        await saveSession(tokens.access_token, tokens.refresh_token, email ?? '');
        set({
          status: 'authenticated',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          email: email ?? decodeJwt(tokens.access_token)?.email ?? null,
        });
      } catch {
        await clearSession();
        set({ status: 'unauthenticated', accessToken: null, refreshToken: null, email: null });
      }
    } catch (err) {
      console.log('[auth] restore: error → unauthenticated', err);
      await clearSession();
      set({ status: 'unauthenticated', accessToken: null, refreshToken: null, email: null });
    }
  },
}));