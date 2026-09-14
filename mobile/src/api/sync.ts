/**
 * Sincronización offline batch (§7.5).
 *
 * El motor de sync envía **una operación por llamada** (FIFO): así un fallo en
 * una cosecha no convierte a sus eventos dependientes en conflictos en cascada.
 * La respuesta puede ser 202 (todo ok) o 207 (multi-status con conflictos).
 */

import { apiRequest } from '@/src/api/client';
import type { EventoCreate } from '@/src/api/types';

export type OperacionSync =
  | {
      tipo: 'registrar_cosecha';
      id: string;
      finca_id: string;
      fecha_cosecha: string;
      peso_kg: number;
      variedad?: string | null;
      metodo_beneficiado?: string | null;
      evidencia_url?: string | null;
      evidencia_sha256?: string | null;
    }
  | {
      tipo: 'avanzar_estado';
      id: string;
      lote_id: string;
      evento: EventoCreate;
    };

export type EstadoResultadoSync = 'ok' | 'conflicto' | 'error';

export interface ResultadoSync {
  id: string;
  estado: EstadoResultadoSync;
  detalle: string | null;
}

export interface RespuestaSync {
  resultados: ResultadoSync[];
}

export function sincronizar(operaciones: OperacionSync[]): Promise<RespuestaSync> {
  return apiRequest<RespuestaSync>('/v1/sync', { method: 'POST', body: { operaciones } });
}
