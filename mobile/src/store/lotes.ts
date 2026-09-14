/**
 * Estado de lotes (Zustand) — conectado al backend (F09) y al modo campo
 * offline (§7.5).
 *
 * Online: lee de la API y refresca la caché local. Offline (`ApiError.status
 * === 0`): sirve la caché y encola la operación de forma optimista. Un 4xx/5xx
 * de negocio nunca se disfraza de offline: se propaga tal cual.
 */

import { create } from 'zustand';

import { ApiError } from '@/src/api/client';
import { crearLote, listarLotes, obtenerLote, registrarEvento } from '@/src/api/lotes';
import type { OperacionSync } from '@/src/api/sync';
import type { EventoCreate, LoteCreate } from '@/src/api/types';
import {
  aLoteDetalleVista,
  aLoteVista,
  aTimeline,
  ESTADO_TRAS_EVENTO,
  type Lote,
} from '@/src/domain/lote';
import * as offline from '@/src/offline';
import { useAuthStore } from '@/src/store/auth';

// Re-exportado para que las pantallas sigan importando desde un único sitio.
export {
  CAMPOS_POR_TIPO,
  ESTADO_TRAS_EVENTO,
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

function esFalloDeRed(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

/** Proyección optimista de una cosecha creada sin red. */
function loteOptimista(datos: LoteCreate): Lote {
  const id = datos.id ?? '';
  return {
    id,
    finca_id: datos.finca_id,
    codigo: 'Lote pendiente de sincronizar',
    codigo_publico: 'LT-PENDIENTE',
    variedad: datos.variedad ?? 'Sin especificar',
    metodo: datos.metodo_beneficiado ?? 'Sin especificar',
    hash_etapa: '',
    hash_sha256: '',
    estado: 'CEREZA',
    peso_actual_kg: datos.peso_kg,
    fecha_cosecha: datos.fecha_cosecha,
    certificado: false,
    codigo_certificado: null,
    pendiente: true,
    historial: aTimeline([
      { id, tipo: 'COSECHA', hash_etapa: null, registrado_en: new Date().toISOString() },
    ]),
  };
}

/** Proyección optimista de un evento encolado sin red. */
function eventoOptimista(actual: Lote, evento: EventoCreate, clave: string): Lote {
  const previos = actual.historial
    .filter((paso) => paso.completed)
    .map((paso) => ({
      id: paso.id,
      tipo: paso.tipo,
      hash_etapa: paso.hash_etapa === '' ? null : paso.hash_etapa,
      registrado_en: paso.fecha,
    }));
  return {
    ...actual,
    estado: ESTADO_TRAS_EVENTO[evento.tipo] ?? actual.estado,
    pendiente: true,
    historial: aTimeline([
      ...previos,
      { id: clave, tipo: evento.tipo, hash_etapa: null, registrado_en: new Date().toISOString() },
    ]),
  };
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
    const userId = useAuthStore.getState().usuarioId;
    try {
      const pagina = await listarLotes(PAGINA);
      const lotes = pagina.items.map(aLoteVista);
      set({ lotes, nextCursor: pagina.next_cursor, isLoading: false });
      if (userId) await offline.guardarRecurso(userId, 'lotes', 'all', lotes);
    } catch (err) {
      const cacheados =
        userId && esFalloDeRed(err)
          ? await offline.leerRecurso<Lote[]>(userId, 'lotes', 'all')
          : null;
      set({
        lotes: cacheados ?? [],
        isLoading: false,
        error: cacheados ? null : mensajeDe(err, 'No se pudieron cargar los lotes.'),
      });
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
    const userId = useAuthStore.getState().usuarioId;
    try {
      const detalle = aLoteDetalleVista(await obtenerLote(loteId));
      set((s) => ({ detalles: { ...s.detalles, [loteId]: detalle } }));
      if (userId) await offline.guardarRecurso(userId, 'lote_detalle', loteId, detalle);
      return detalle;
    } catch (err) {
      const cacheado =
        userId && esFalloDeRed(err)
          ? await offline.leerRecurso<Lote>(userId, 'lote_detalle', loteId)
          : null;
      if (cacheado) {
        set((s) => ({ detalles: { ...s.detalles, [loteId]: cacheado } }));
        return cacheado;
      }
      set({ error: mensajeDe(err, 'No se pudo cargar el lote.') });
      return null;
    }
  },

  crear: async (datos) => {
    const userId = useAuthStore.getState().usuarioId;
    try {
      const creado = aLoteVista(await crearLote(datos));
      // Alta optimista en la lista para que aparezca sin esperar un refetch.
      set((s) => ({ lotes: [creado, ...s.lotes.filter((l) => l.id !== creado.id)] }));
      if (userId) await offline.guardarRecurso(userId, 'lotes', 'all', get().lotes);
      return creado;
    } catch (err) {
      if (!esFalloDeRed(err) || !userId || !datos.id) throw err;
      const optimista = loteOptimista(datos);
      const lotes = [optimista, ...get().lotes.filter((l) => l.id !== optimista.id)];
      const operacion: OperacionSync = {
        tipo: 'registrar_cosecha',
        id: datos.id,
        finca_id: datos.finca_id,
        fecha_cosecha: datos.fecha_cosecha,
        peso_kg: datos.peso_kg,
        variedad: datos.variedad ?? null,
        metodo_beneficiado: datos.metodo_beneficiado ?? null,
        evidencia_url: datos.evidencia_url ?? null,
        evidencia_sha256: datos.evidencia_sha256 ?? null,
      };
      await offline.guardarOptimista(
        userId,
        [
          { resource: 'lote_detalle', resourceId: optimista.id, data: optimista },
          { resource: 'lotes', resourceId: 'all', data: lotes },
        ],
        operacion,
      );
      set((s) => ({ lotes, detalles: { ...s.detalles, [optimista.id]: optimista } }));
      return optimista;
    }
  },

  avanzar: async (loteId, evento, clave) => {
    const userId = useAuthStore.getState().usuarioId;
    try {
      const detalle = aLoteDetalleVista(await registrarEvento(loteId, evento, clave));
      set((s) => ({
        detalles: { ...s.detalles, [loteId]: detalle },
        lotes: s.lotes.map((l) => (l.id === loteId ? { ...detalle, historial: [] } : l)),
      }));
      if (userId) await offline.guardarRecurso(userId, 'lote_detalle', loteId, detalle);
      return detalle;
    } catch (err) {
      const actual = get().detalles[loteId];
      if (!esFalloDeRed(err) || !userId || !actual) throw err;
      const optimista = eventoOptimista(actual, evento, clave);
      const operacion: OperacionSync = {
        tipo: 'avanzar_estado',
        id: clave,
        lote_id: loteId,
        evento,
      };
      await offline.guardarOptimista(
        userId,
        [{ resource: 'lote_detalle', resourceId: loteId, data: optimista }],
        operacion,
      );
      set((s) => ({
        detalles: { ...s.detalles, [loteId]: optimista },
        lotes: s.lotes.map((l) => (l.id === loteId ? { ...optimista, historial: [] } : l)),
      }));
      return optimista;
    }
  },
}));
