/**
 * Almacenamiento de sesión.
 * - Native: expo-secure-store (Keychain / Keystore).
 * - Web: expo-secure-store NO tiene implementación (stub vacío, issue
 *   expo/expo#10546); usamos un fallback en memoria para no romper el render.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_KEY = 'bt.access_token';
const REFRESH_KEY = 'bt.refresh_token';
const EMAIL_KEY = 'bt.email';
const USUARIO_ID_KEY = 'bt.usuario_id';
const ROL_KEY = 'bt.rol';

export interface SesionGuardada {
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  usuarioId: string | null;
  rol: string | null;
}

const isWeb = Platform.OS === 'web';
const memoryStore = new Map<string, string>();

/** Genéricos: reusados por otras preferencias simples (p.ej. tema, `store/tema.ts`). */
export async function getItem(key: string): Promise<string | null> {
  if (isWeb) return memoryStore.get(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    memoryStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    memoryStore.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveSession(sesion: SesionGuardada): Promise<void> {
  const escrituras = [
    setItem(ACCESS_KEY, sesion.accessToken ?? ''),
    setItem(REFRESH_KEY, sesion.refreshToken ?? ''),
    setItem(EMAIL_KEY, sesion.email ?? ''),
  ];
  // `usuarioId` y `rol` se persisten para que una sesión restaurada sin red
  // conserve la identidad (la UI no se degrada a "sin rol").
  if (sesion.usuarioId) escrituras.push(setItem(USUARIO_ID_KEY, sesion.usuarioId));
  if (sesion.rol) escrituras.push(setItem(ROL_KEY, sesion.rol));
  await Promise.all(escrituras);
}

export async function readSession(): Promise<SesionGuardada> {
  const [accessToken, refreshToken, email, usuarioId, rol] = await Promise.all([
    getItem(ACCESS_KEY),
    getItem(REFRESH_KEY),
    getItem(EMAIL_KEY),
    getItem(USUARIO_ID_KEY),
    getItem(ROL_KEY),
  ]);
  return { accessToken, refreshToken, email, usuarioId, rol };
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    deleteItem(ACCESS_KEY),
    deleteItem(REFRESH_KEY),
    deleteItem(EMAIL_KEY),
    deleteItem(USUARIO_ID_KEY),
    deleteItem(ROL_KEY),
  ]);
}