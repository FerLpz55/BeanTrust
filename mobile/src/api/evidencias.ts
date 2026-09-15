/**
 * Evidencia fotográfica privada (ADR-14).
 *
 * El binario entra por `multipart/form-data` y nunca cruza como JSON. El móvil
 * no habla con Storage: sube por `POST /v1/evidencias` y recibe un `id` con el
 * que referencia la foto al crear el lote. La lectura se hace con una URL
 * firmada de vida corta (`GET /v1/lotes/{lote_id}/evidencia`).
 */

import { apiFormData, apiRequest } from '@/src/api/client';
import type { EvidenciaRead, EvidenciaUrlRead } from '@/src/api/types';

export interface SubirEvidenciaArgs {
  fincaId: string;
  loteId: string;
  /** Ruta local persistente del JPEG ya normalizado. */
  localPath: string;
  /** UUID de la evidencia: es también el `Idempotency-Key` del POST. */
  claveIdempotencia: string;
}

/**
 * Sube la evidencia. No fija `Content-Type`: React Native construye el boundary
 * a partir del `FormData` (ver `apiFormData`).
 */
export function subirEvidencia(args: SubirEvidenciaArgs): Promise<EvidenciaRead> {
  const form = new FormData();
  form.append('finca_id', args.fincaId);
  form.append('lote_id', args.loteId);
  // React Native interpreta `{ uri, name, type }` como parte de archivo; el
  // tipo `Blob` del DOM no modela esa forma, de ahí el cast.
  form.append('archivo', {
    uri: args.localPath,
    name: `${args.claveIdempotencia}.jpg`,
    type: 'image/jpeg',
  } as unknown as Blob);

  return apiFormData<EvidenciaRead>('/v1/evidencias', form, {
    idempotencyKey: args.claveIdempotencia,
  });
}

/** URL firmada (~10 min) de la evidencia adjunta al lote. 404 si no hay. */
export function obtenerUrlEvidencia(loteId: string): Promise<EvidenciaUrlRead> {
  return apiRequest<EvidenciaUrlRead>(`/v1/lotes/${loteId}/evidencia`);
}
