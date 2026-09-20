/** Fincas del usuario (B15) y alta inicial del productor (onboarding). */

import { apiRequest } from '@/src/api/client';
import type { FincaRead } from '@/src/api/types';

export interface FincaCreate {
  /** UUID generado por el móvil; también es la clave de idempotencia. */
  id: string;
  nombre: string;
  municipio: string;
  altitud_min?: number | null;
  altitud_max?: number | null;
}

export function listarFincas(): Promise<FincaRead[]> {
  return apiRequest<FincaRead[]>('/v1/fincas');
}

/**
 * Crea la finca una sola vez. El `id` se genera al abrir el formulario y se
 * reutiliza en cada reintento: el backend responde la finca existente si la
 * petición ya se había aplicado.
 */
export function crearFinca(datos: FincaCreate): Promise<FincaRead> {
  return apiRequest<FincaRead>('/v1/fincas', {
    method: 'POST',
    body: datos,
    idempotencyKey: datos.id,
  });
}
