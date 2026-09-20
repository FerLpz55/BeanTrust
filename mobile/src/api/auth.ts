/** Endpoints de autenticación (§10). */

import { apiRequest } from '@/src/api/client';
import type { CurrentUser, RecoverResponse, TokenResponse } from '@/src/api/types';

export function login(email: string, password: string): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/v1/auth/login', {
    method: 'POST',
    body: { email, password },
    token: null,
  });
}

export function refresh(refreshToken: string): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/v1/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
    token: null,
  });
}

/** Alta pública: el backend siempre crea un `productor` (sin rol en el cuerpo). */
export function register(
  email: string,
  password: string,
  nombre: string
): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/v1/auth/register', {
    method: 'POST',
    body: { email, password, nombre },
    token: null,
  });
}

/** Solicita recuperación. La respuesta es uniforme exista o no el email (B14). */
export function recover(email: string): Promise<RecoverResponse> {
  return apiRequest<RecoverResponse>('/v1/auth/recover', {
    method: 'POST',
    body: { email },
    token: null,
  });
}

export function recoverConfirm(token: string, password: string): Promise<RecoverResponse> {
  return apiRequest<RecoverResponse>('/v1/auth/recover/confirm', {
    method: 'POST',
    body: { token, password },
    token: null,
  });
}

/** Perfil real del usuario: el `rol` se resuelve en el backend, no del JWT. */
export function me(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/v1/auth/me');
}
