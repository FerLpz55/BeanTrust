/**
 * Sesión offline: un fallo de red al refrescar NO debe borrar la sesión ni la
 * identidad cacheada; un refresh inválido (401) sí debe limpiarla.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/src/api/client';
import * as api from '@/src/api/auth';
import * as secure from '@/src/storage/secure';
import { useAuthStore } from '@/src/store/auth';
import { isTokenExpired } from '@/src/utils/jwt';

vi.mock('@/src/storage/secure', () => ({
  readSession: vi.fn(),
  saveSession: vi.fn(),
  clearSession: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@/src/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  refresh: vi.fn(),
  me: vi.fn(),
}));

vi.mock('@/src/utils/jwt', () => ({
  decodeJwt: vi.fn(() => ({ email: 'a@b.c' })),
  isTokenExpired: vi.fn(() => true),
}));

const SESION = {
  accessToken: 'access-viejo',
  refreshToken: 'refresh-viejo',
  email: 'productor@beantrust.dev',
  usuarioId: 'usuario-1',
  rol: 'productor',
};

beforeEach(async () => {
  await useAuthStore.getState().logout();
  vi.clearAllMocks();
  vi.mocked(isTokenExpired).mockReturnValue(true);
  useAuthStore.setState({ status: 'restoring', rol: null, usuarioId: null });
});

describe('auth store · sesión offline', () => {
  it('conserva identidad y caché si el refresh falla por red', async () => {
    vi.mocked(secure.readSession).mockResolvedValue(SESION);
    vi.mocked(api.refresh).mockRejectedValue(new ApiError(0, 'sin red'));

    await useAuthStore.getState().restore();

    const estado = useAuthStore.getState();
    expect(estado.status).toBe('authenticated');
    expect(estado.usuarioId).toBe('usuario-1');
    expect(estado.rol).toBe('productor');
    expect(secure.clearSession).not.toHaveBeenCalled();
  });

  it('restaura la identidad cacheada sin red si el access token sigue válido', async () => {
    vi.mocked(isTokenExpired).mockReturnValue(false);
    vi.mocked(secure.readSession).mockResolvedValue(SESION);
    vi.mocked(api.me).mockRejectedValue(new ApiError(0, 'sin red'));

    await useAuthStore.getState().restore();

    const estado = useAuthStore.getState();
    expect(estado.status).toBe('authenticated');
    expect(estado.usuarioId).toBe('usuario-1');
    expect(estado.rol).toBe('productor');
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it('un refresh inválido (401) limpia la sesión', async () => {
    vi.mocked(isTokenExpired).mockReturnValue(true);
    vi.mocked(secure.readSession).mockResolvedValue(SESION);
    vi.mocked(api.refresh).mockRejectedValue(new ApiError(401, 'refresh inválido'));

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(secure.clearSession).toHaveBeenCalled();
  });
});
