/** Fincas del usuario (B15): resuelve el `finca_id` que exige `POST /v1/lotes`. */

import { apiRequest } from '@/src/api/client';
import type { FincaRead } from '@/src/api/types';

export function listarFincas(): Promise<FincaRead[]> {
  return apiRequest<FincaRead[]>('/v1/fincas');
}
