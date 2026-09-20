/**
 * Pasaporte de Café: verificación pública (F12, §8).
 *
 * Conectado a `GET /v1/verificar/{codigo}` **sin token** (el grupo `verificar/`
 * vive fuera del auth). Distingue los tres desenlaces del contrato:
 * 200 pasaporte válido · 404 código inexistente · 409 certificado manipulado.
 *
 * Concurrencia: cada consulta lleva un identificador monotónico. Una respuesta
 * que llega después de otra consulta (o de `reset`) se descarta, de modo que un
 * pasaporte viejo nunca pisa a uno nuevo. El pasaporte visible se conserva
 * durante una actualización (p. ej. el polling del anclaje).
 */

import { create } from 'zustand';

import { ApiError } from '@/src/api/client';
import type { VerificarRead } from '@/src/api/types';
import { verificarCodigo } from '@/src/api/verificar';
import { aTimeline, type LoteEvento } from '@/src/domain/lote';
import { registrarLimpiezaSesion } from '@/src/store/sesion';

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
  /** Título corto y específico del desenlace, para la pantalla de error. */
  tituloError: string | null;
  motivo: MotivoError | null;
  buscarPorCodigo: (codigo: string) => Promise<void>;
  reset: () => void;
}

/** Última consulta emitida; se incrementa también en `reset`. */
let solicitudActual = 0;

function clasificar(err: unknown): {
  motivo: MotivoError;
  titulo: string;
  mensaje: string;
} {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return {
        motivo: 'no_encontrado',
        titulo: 'Lote no encontrado',
        mensaje: 'El código no corresponde a ningún lote registrado.',
      };
    }
    if (err.status === 409) {
      return {
        motivo: 'manipulado',
        titulo: 'Certificado no verificable',
        mensaje:
          'El pasaporte no coincide con el historial del lote: pudo ser manipulado.',
      };
    }
    if (err.status === 0) {
      return {
        motivo: 'red',
        titulo: 'Sin conexión',
        mensaje: 'No se pudo contactar el servidor. Revisa tu conexión e inténtalo de nuevo.',
      };
    }
  }
  return {
    motivo: 'red',
    titulo: 'No se pudo verificar',
    mensaje: 'No se pudo verificar el código. Revisa tu conexión.',
  };
}

export const useVerificarStore = create<VerificarState>((set) => ({
  data: null,
  isLoading: false,
  error: null,
  tituloError: null,
  motivo: null,

  buscarPorCodigo: async (codigo: string) => {
    const id = ++solicitudActual;
    const limpio = codigo.trim().toUpperCase();
    if (!limpio) {
      set({
        isLoading: false,
        error: 'Ingresa un código.',
        tituloError: 'Código vacío',
        motivo: 'no_encontrado',
        data: null,
      });
      return;
    }
    // No se limpia `data`: el pasaporte anterior sigue visible mientras
    // se actualiza (polling, pull-to-refresh, volver a foco).
    set({ isLoading: true, error: null, tituloError: null, motivo: null });
    try {
      const pasaporte = await verificarCodigo(limpio);
      if (id !== solicitudActual) return;
      set({
        isLoading: false,
        data: { pasaporte, timeline: aTimeline(pasaporte.historial) },
        error: null,
        tituloError: null,
        motivo: null,
      });
    } catch (err) {
      if (id !== solicitudActual) return;
      const { motivo, titulo, mensaje } = clasificar(err);
      set({ isLoading: false, error: mensaje, tituloError: titulo, motivo });
    }
  },

  reset: () => {
    // Invalida cualquier consulta en vuelo: su respuesta se descartará.
    solicitudActual += 1;
    set({
      data: null,
      isLoading: false,
      error: null,
      tituloError: null,
      motivo: null,
    });
  },
}));

registrarLimpiezaSesion(() => {
  useVerificarStore.getState().reset();
});
