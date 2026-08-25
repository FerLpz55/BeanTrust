/**
 * Estado de lotes (Zustand) — conectado al backend (F09).
 *
 * Lista paginada por cursor (`GET /v1/lotes`) y detalle con timeline real
 * (`GET /v1/lotes/{id}`). El modelo de vista y la proyección del historial
 * viven en `src/domain/lote.ts`.
 */

import { create } from 'zustand';

import { ApiError } from '@/src/api/client';
import { crearLote, listarLotes, obtenerLote, registrarEvento } from '@/src/api/lotes';
import type { EventoCreate, LoteCreate } from '@/src/api/types';
import { aLoteDetalleVista, aLoteVista, type Lote } from '@/src/domain/lote';

// Re-exportado para que las pantallas sigan importando desde un único sitio.
export {
  CAMPOS_POR_TIPO,
  EVENTO_DESCRIPCION,
  EVENTO_ICONO,
  EVENTO_ORDEN,
  RECHAZO_DISPONIBLE_DESDE,
  TRANSICIONES_VALIDAS,
  type CampoEvento,
  type EventoTipo,
  type Lote,
  type LoteEstado,
  type LoteEvento,
} from '@/src/domain/lote';

const PAGINA = 20;

interface LotesState {
  lotes: Lote[];
  /** Detalles ya cargados, por id (evita recargar al volver al detalle). */
  detalles: Record<string, Lote>;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  nextCursor: string | null;
  cargar: () => Promise<void>;
  cargarMas: () => Promise<void>;
  cargarDetalle: (loteId: string) => Promise<Lote | null>;
  crear: (datos: LoteCreate) => Promise<Lote>;
  avanzar: (loteId: string, evento: EventoCreate, clave: string) => Promise<Lote>;
}

function mensajeDe(err: unknown, porDefecto: string): string {
  return err instanceof ApiError ? err.message : porDefecto;
}

export const useLotesStore = create<LotesState>((set, get) => ({
  lotes: [],
  detalles: {},
  isLoading: false,
  isLoadingMore: false,
  error: null,
  nextCursor: null,

  cargar: async () => {
    set({ isLoading: true, error: null });
    try {
      const pagina = await listarLotes(PAGINA);
      set({
        lotes: pagina.items.map(aLoteVista),
        nextCursor: pagina.next_cursor,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false, error: mensajeDe(err, 'No se pudieron cargar los lotes.') });
    }
  },

  cargarMas: async () => {
    const { nextCursor, isLoadingMore, lotes } = get();
    if (!nextCursor || isLoadingMore) return;
    set({ isLoadingMore: true });
    try {
      const pagina = await listarLotes(PAGINA, nextCursor);
      set({
        lotes: [...lotes, ...pagina.items.map(aLoteVista)],
        nextCursor: pagina.next_cursor,
        isLoadingMore: false,
      });
    } catch {
      set({ isLoadingMore: false });
    }
  },

  cargarDetalle: async (loteId) => {
    try {
      const detalle = aLoteDetalleVista(await obtenerLote(loteId));
      set((s) => ({ detalles: { ...s.detalles, [loteId]: detalle } }));
      return detalle;
    } catch (err) {
      set({ error: mensajeDe(err, 'No se pudo cargar el lote.') });
      return null;
    }
  },

  crear: async (datos) => {
    const creado = aLoteVista(await crearLote(datos));
    // Alta optimista en la lista para que aparezca sin esperar un refetch.
    set((s) => ({ lotes: [creado, ...s.lotes.filter((l) => l.id !== creado.id)] }));
    return creado;
  },

  avanzar: async (loteId, evento, clave) => {
    const detalle = aLoteDetalleVista(await registrarEvento(loteId, evento, clave));
    set((s) => ({
      detalles: { ...s.detalles, [loteId]: detalle },
      lotes: s.lotes.map((l) => (l.id === loteId ? { ...detalle, historial: [] } : l)),
    }));
    return detalle;
  },
}));
