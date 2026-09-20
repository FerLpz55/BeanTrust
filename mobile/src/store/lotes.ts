/**
 * Estado de lotes (Zustand) — conectado al backend (F09) y al modo campo
 * offline (§7.5).
 *
 * **Encolar primero**: toda mutación (alta de lote con/sin foto, avance de
 * estado) se persiste como operación local y, si hay red, se intenta
 * sincronizar en el acto. El mismo camino sirve online y offline; el backend
 * confirma y, cuando la cola del lote se vacía, se recarga el dato real.
 *
 * Las lecturas siguen sirviendo la caché ante un fallo de red (`ApiError.status
 * === 0`). Un 4xx/5xx de negocio nunca se disfraza de offline: se propaga.
 */

import { create } from 'zustand';

import { ApiError, SesionCambiadaError } from '@/src/api/client';
import { listarLotes, obtenerLote, registrarEvento, crearLote } from '@/src/api/lotes';
import type { EventoCreate, LoteCreate } from '@/src/api/types';
import {
  aLoteDetalleVista,
  aLoteVista,
  aTimeline,
  ESTADO_TRAS_EVENTO,
  type Lote,
} from '@/src/domain/lote';
import type { AdjuntoLocal } from '@/src/evidencia/types';
import * as offline from '@/src/offline';
import type { OperacionPendiente } from '@/src/offline/types';
import { useAuthStore } from '@/src/store/auth';
import { registrarLimpiezaSesion } from '@/src/store/sesion';

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
  crear: (datos: LoteCreate, adjunto?: AdjuntoLocal | null) => Promise<Lote>;
  avanzar: (loteId: string, evento: EventoCreate, clave: string) => Promise<Lote>;
  reset: () => void;
}

function mensajeDe(err: unknown, porDefecto: string): string {
  return err instanceof ApiError ? err.message : porDefecto;
}

function esFalloDeRed(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

/** ¿La operación pertenece al lote indicado? */
function perteneceAlLote(payload: OperacionPendiente, loteId: string): boolean {
  if (payload.tipo === 'registrar_cosecha') return payload.id === loteId;
  return payload.lote_id === loteId;
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

/**
 * Persiste recursos + adjunto + operaciones en una transacción, intenta el
 * flush si hay red y responde si el lote quedó **sin** operaciones pendientes.
 */
async function encolarYConfirmar(
  userId: string,
  recursos: Parameters<typeof offline.guardarOptimista>[1],
  operaciones: OperacionPendiente[],
  loteId: string,
  adjunto?: AdjuntoLocal,
): Promise<boolean> {
  await offline.guardarOptimista(userId, recursos, operaciones, adjunto);
  if (offline.esOnline()) {
    await offline.sincronizarAhora();
  }
  const cola = await offline.listarCola(userId);
  return !cola.some((item) => perteneceAlLote(item.payload, loteId));
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
      if (err instanceof SesionCambiadaError) return;
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
      if (err instanceof SesionCambiadaError) return null;
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

  crear: async (datos, adjunto = null) => {
    const userId = useAuthStore.getState().usuarioId;
    // Sin sesión o sin id no hay cola posible: alta directa (caso borde).
    if (!userId || !datos.id) {
      const creado = aLoteVista(await crearLote(datos));
      set((s) => ({ lotes: [creado, ...s.lotes.filter((l) => l.id !== creado.id)] }));
      return creado;
    }

    const optimista = loteOptimista(datos);
    const lotes = [optimista, ...get().lotes.filter((l) => l.id !== optimista.id)];
    const evidenciaId = adjunto?.id ?? datos.evidencia_id ?? null;

    // Con foto: primero `subir_evidencia`, luego `registrar_cosecha`. Sin foto:
    // solo la cosecha. El orden FIFO garantiza que la foto exista antes.
    const operaciones: OperacionPendiente[] = [];
    if (adjunto) {
      operaciones.push({
        tipo: 'subir_evidencia',
        id: adjunto.id,
        lote_id: optimista.id,
        finca_id: datos.finca_id,
        adjunto_id: adjunto.id,
      });
    }
    operaciones.push({
      tipo: 'registrar_cosecha',
      id: optimista.id,
      finca_id: datos.finca_id,
      fecha_cosecha: datos.fecha_cosecha,
      peso_kg: datos.peso_kg,
      variedad: datos.variedad ?? null,
      metodo_beneficiado: datos.metodo_beneficiado ?? null,
      evidencia_id: evidenciaId,
    });

    set((s) => ({ lotes, detalles: { ...s.detalles, [optimista.id]: optimista } }));

    const confirmado = await encolarYConfirmar(
      userId,
      [
        { resource: 'lote_detalle', resourceId: optimista.id, data: optimista },
        { resource: 'lotes', resourceId: 'all', data: lotes },
      ],
      operaciones,
      optimista.id,
      adjunto ?? undefined,
    );

    // Confirmado: el backend es la fuente de verdad, se recarga el lote real.
    if (confirmado) {
      const real = await get().cargarDetalle(optimista.id);
      if (real) {
        set((s) => ({
          lotes: s.lotes.map((l) => (l.id === real.id ? { ...real, historial: [] } : l)),
        }));
        return real;
      }
    }
    return optimista;
  },

  avanzar: async (loteId, evento, clave) => {
    const userId = useAuthStore.getState().usuarioId;
    const actual = get().detalles[loteId];

    // Sin proyección local no se puede encolar: se intenta directo (y si no
    // hay red, propaga el ApiError como cualquier lectura).
    if (!userId || !actual) {
      const detalle = aLoteDetalleVista(await registrarEvento(loteId, evento, clave));
      set((s) => ({
        detalles: { ...s.detalles, [loteId]: detalle },
        lotes: s.lotes.map((l) => (l.id === loteId ? { ...detalle, historial: [] } : l)),
      }));
      if (userId) await offline.guardarRecurso(userId, 'lote_detalle', loteId, detalle);
      return detalle;
    }

    const optimista = eventoOptimista(actual, evento, clave);
    const operacion: OperacionPendiente = {
      tipo: 'avanzar_estado',
      id: clave,
      lote_id: loteId,
      evento,
    };
    set((s) => ({
      detalles: { ...s.detalles, [loteId]: optimista },
      lotes: s.lotes.map((l) => (l.id === loteId ? { ...optimista, historial: [] } : l)),
    }));

    const confirmado = await encolarYConfirmar(
      userId,
      [{ resource: 'lote_detalle', resourceId: loteId, data: optimista }],
      [operacion],
      loteId,
    );
    if (confirmado) {
      const real = await get().cargarDetalle(loteId);
      if (real) {
        set((s) => ({
          lotes: s.lotes.map((l) => (l.id === real.id ? { ...real, historial: [] } : l)),
        }));
        return real;
      }
    }
    return optimista;
  },

  reset: () =>
    set({
      lotes: [],
      detalles: {},
      isLoading: false,
      isLoadingMore: false,
      error: null,
      nextCursor: null,
    }),
}));

registrarLimpiezaSesion(() => {
  useLotesStore.getState().reset();
});
