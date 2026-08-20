/** Endpoints de autenticación del backend (§10). */

import { apiRequest } from '@/src/api/client';
import type { TokenResponse } from '@/src/api/types';

export function login(email: string, password: string): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function refresh(refreshToken: string): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/v1/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}