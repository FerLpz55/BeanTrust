/**
 * Tipos de la captura de evidencia (ADR-14).
 *
 * `AdjuntoLocal` es la foto ya normalizada y persistida en disco. Solo se
 * guardan rutas **persistentes** (nunca URIs temporales de ImagePicker/cache):
 * el archivo debe sobrevivir al cierre de la app y al sistema operativo.
 */

import type { ImagePickerAsset } from 'expo-image-picker';

export interface AdjuntoLocal {
  /** UUID de la evidencia: idempotencia de subida y `evidencia_id` del lote. */
  id: string;
  loteId: string;
  /** URI `file://` en el directorio de documentos (no cache). */
  localPath: string;
  mime: 'image/jpeg';
  bytes: number;
  sha256: string;
}

/** Resultado de pedir una foto: distingue cancelación de permiso denegado. */
export type ResultadoCaptura =
  | { estado: 'ok'; asset: ImagePickerAsset }
  | { estado: 'cancelado' }
  | { estado: 'permiso_denegado' };
