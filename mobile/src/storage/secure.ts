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

export async function saveSession(
  accessToken: string,
  refreshToken: string,
  email: string
): Promise<void> {
  await Promise.all([
    setItem(ACCESS_KEY, accessToken),
    setItem(REFRESH_KEY, refreshToken),
    setItem(EMAIL_KEY, email),
  ]);
}

export async function readSession(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
}> {
  const [accessToken, refreshToken, email] = await Promise.all([
    getItem(ACCESS_KEY),
    getItem(REFRESH_KEY),
    getItem(EMAIL_KEY),
  ]);
  return { accessToken, refreshToken, email };
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    deleteItem(ACCESS_KEY),
    deleteItem(REFRESH_KEY),
    deleteItem(EMAIL_KEY),
  ]);
}