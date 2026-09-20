/**
 * Cliente HTTP hacia el backend FastAPI.
 *
 * Dos responsabilidades más allá de `fetch`:
 * 1. `Idempotency-Key` en los POST de operación (eventos, pagos, propinas).
 * 2. Renovación transparente del access token ante un 401, con una única cola
 *    de refresh compartida para que N peticiones en paralelo no disparen N
 *    renovaciones.
 */

import { API_TIMEOUT_MS, API_URL } from '@/src/config';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Respuesta descartada porque la sesión cambió (login/logout) mientras la
 * petición estaba en vuelo. Los stores la ignoran para no pintar datos de una
 * cuenta anterior sobre la nueva.
 */
export class SesionCambiadaError extends Error {
  constructor() {
    super('La sesión cambió durante la petición.');
    this.name = 'SesionCambiadaError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  /** UUID de idempotencia; se envía como header `Idempotency-Key`. */
  idempotencyKey?: string;
  /** Interno: evita reintentar en bucle tras renovar. */
  _reintentado?: boolean;
}

/** Construye el `RequestInit` de una petición a partir del token y la señal. */
type ConstructorPeticion = (token: string | null, signal: AbortSignal) => RequestInit;

/**
 * Puente con el store de auth, inyectado en el arranque para no crear un ciclo
 * de imports (`store/auth` → `api/*` → `client`).
 */
interface SesionHooks {
  getAccessToken: () => string | null;
  renovar: () => Promise<string | null>;
  cerrarSesion: () => Promise<void>;
  /** Generación de sesión: si cambia en vuelo, la respuesta se descarta. */
  getGeneracion?: () => number;
}

let hooks: SesionHooks | null = null;

export function configurarSesion(nuevos: SesionHooks): void {
  hooks = nuevos;
}

/** Cola única: varias peticiones que fallan a la vez comparten un refresh. */
let refreshEnCurso: Promise<string | null> | null = null;

function renovarUnaVez(): Promise<string | null> {
  if (!hooks) return Promise.resolve(null);
  refreshEnCurso ??= hooks.renovar().finally(() => {
    refreshEnCurso = null;
  });
  return refreshEnCurso;
}

async function ejecutar(
  path: string,
  construir: ConstructorPeticion,
  token: string | null,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, construir(token, controller.signal));
  } finally {
    clearTimeout(timer);
  }
}

function detalleDeError(payload: unknown, status: number): string {
  if (typeof payload === 'object' && payload !== null && 'detail' in payload) {
    const detail = (payload as { detail: unknown }).detail;
    // 422 de FastAPI: `detail` es una lista de errores de validación.
    if (Array.isArray(detail)) {
      const primero = detail[0] as { msg?: string } | undefined;
      return primero?.msg ?? 'Datos inválidos.';
    }
    return String(detail);
  }
  return `Error ${status}`;
}

/**
 * Núcleo compartido por `apiRequest` y `apiFormData`: resuelve la sesión,
 * aplica timeout, renueva una única vez ante un 401 y decodifica el error.
 */
async function solicitar<T>(
  path: string,
  opciones: RequestOptions,
  construir: ConstructorPeticion,
): Promise<T> {
  // `token` explícito gana; si no, se toma la sesión activa. `null` explícito
  // fuerza petición anónima (grupo público `verificar/`).
  const token =
    opciones.token !== undefined ? opciones.token : (hooks?.getAccessToken() ?? null);
  const generacion = hooks?.getGeneracion?.() ?? 0;

  let response: Response;
  try {
    response = await ejecutar(path, construir, token);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, 'No se pudo contactar el servidor. Revisa tu conexión.');
    }
    throw new ApiError(0, 'No se pudo contactar el servidor.');
  }

  // La sesión cambió mientras la petición estaba en vuelo: se descarta.
  if (hooks?.getGeneracion && hooks.getGeneracion() !== generacion) {
    throw new SesionCambiadaError();
  }

  // Access expirado con la app abierta: renovar una vez y repetir.
  if (
    response.status === 401 &&
    !opciones._reintentado &&
    opciones.token === undefined &&
    token !== null
  ) {
    const nuevo = await renovarUnaVez();
    if (nuevo) {
      return solicitar<T>(path, { ...opciones, token: nuevo, _reintentado: true }, construir);
    }
    await hooks?.cerrarSesion();
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, detalleDeError(payload, response.status));
  }
  return payload as T;
}

export function apiRequest<T>(path: string, opciones: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers, idempotencyKey } = opciones;
  return solicitar<T>(path, opciones, (token, signal) => ({
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  }));
}

/**
 * Petición `multipart/form-data` (ADR-14).
 *
 * Regla dura: **nunca** se asigna `Content-Type` a mano. React Native crea el
 * boundary del multipart a partir del `FormData`; fijar la cabecera rompe la
 * subida. El resto de la lógica (token, refresh, timeout, errores) es la misma
 * que la de `apiRequest`.
 */
export function apiFormData<T>(
  path: string,
  form: FormData,
  opciones: RequestOptions = {},
): Promise<T> {
  const { method = 'POST', headers, idempotencyKey } = opciones;
  return solicitar<T>(path, opciones, (token, signal) => ({
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...headers,
    },
    body: form,
    signal,
  }));
}
