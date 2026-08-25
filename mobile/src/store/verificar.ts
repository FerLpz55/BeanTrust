/**
 * Pasaporte de Café: verificación pública (F12, §8).
 *
 * Conectado a `GET /v1/verificar/{codigo}` **sin token** (el grupo `verificar/`
 * vive fuera del auth). Distingue los tres desenlaces del contrato:
 * 200 pasaporte válido · 404 código inexistente · 409 certificado manipulado.
 */

import { create } from 'zustand';

import { ApiError } from '@/src/api/client';
import type { VerificarRead } from '@/src/api/types';
import { verificarCodigo } from '@/src/api/verificar';
import { aTimeline, type LoteEvento } from '@/src/domain/lote';

export interface VerificarData {
  pasaporte: VerificarRead;
  /** Historial proyectado sobre la cadena canónica de 11 etapas. */
  timeline: LoteEvento[];
}

/** `manipulado` (409) merece un tratamiento distinto a "no encontrado" (404). */
export type MotivoError = 'no_encontrado' | 'manipulado' | 'red';

interface VerificarState {
  data: VerificarData | null;
  isLoading: boolean;
  error: string | null;
  motivo: MotivoError | null;
  buscarPorCodigo: (codigo: string) => Promise<void>;
  reset: () => void;
}

function clasificar(err: unknown): { motivo: MotivoError; mensaje: string } {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return { motivo: 'no_encontrado', mensaje: 'Código no encontrado o inválido.' };
    }
    if (err.status === 409) {
      return {
        motivo: 'manipulado',
        mensaje: 'El pasaporte no coincide con el historial del lote: pudo ser manipulado.',
      };
    }
  }
  return { motivo: 'red', mensaje: 'No se pudo verificar el código. Revisa tu conexión.' };
}

export const useVerificarStore = create<VerificarState>((set) => ({
  data: null,
  isLoading: false,
  error: null,
  motivo: null,

  buscarPorCodigo: async (codigo: string) => {
    const limpio = codigo.trim().toUpperCase();
    if (!limpio) {
      set({ error: 'Ingresa un código.', motivo: 'no_encontrado', data: null });
      return;
    }
    set({ isLoading: true, error: null, motivo: null, data: null });
    try {
      const pasaporte = await verificarCodigo(limpio);
      set({
        isLoading: false,
        data: { pasaporte, timeline: aTimeline(pasaporte.historial) },
        error: null,
        motivo: null,
      });
    } catch (err) {
      const { motivo, mensaje } = clasificar(err);
      set({ isLoading: false, data: null, error: mensaje, motivo });
    }
  },

  reset: () => set({ data: null, isLoading: false, error: null, motivo: null }),
}));
