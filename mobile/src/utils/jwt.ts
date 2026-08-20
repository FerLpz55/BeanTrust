/** Decodificación local (sin validación) del payload de un JWT para lecturas de UI. */

export interface JwtPayload {
  sub?: string;
  email?: string;
  exp?: number;
  typ?: string;
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const decoded = atob(padded);
  return decodeURIComponent(
    Array.from(decoded)
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
  );
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    return JSON.parse(base64UrlDecode(payload)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const payload = decodeJwt(token);
  if (!payload?.exp) return true;
  return payload.exp <= nowSeconds;
}