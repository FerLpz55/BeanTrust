/**
 * Estado de sincronización offline (Zustand).
 *
 * Es un espejo en memoria de la cola persistida en `src/offline/`. Las
 * pantallas solo leen de aquí; nunca hablan con SQLite ni con NetInfo.
 */

import { create } from 'zustand';

import * as offline from '@/src/offline';
import type { RegistroCola } from '@/src/offline/types';
import { useLotesStore } from '@/src/store/lotes';
import { usePerfilStore } from '@/src/store/perfil';

/** El backend sigue siendo la fuente de verdad: al vaciar cola, se refresca. */
async function refrescarFuentes(): Promise<void> {
  await Promise.allSettled([
    useLotesStore.getState().cargar(),
    usePerfilStore.getState().cargarFincas(),
  ]);
}

interface SyncState {
  isOnline: boolean;
  sincronizando: boolean;
  /** Operaciones pendientes (aún reintentables). */
  pendientes: RegistroCola[];
  /** Operaciones en conflicto: requieren reintento o descarte manual. */
  conflictos: RegistroCola[];
  pendingCount: number;
  /** Lotes con al menos una operación en cola (para marcar la UI). */
  lotesConPendientes: string[];
  /** Eventos en cola por lote (para distinguir etapas pendientes). */
  eventosPendientes: Record<string, number>;
  ultimoIntento: string | null;
  error: string | null;

  inicializar: (userId: string) => Promise<void>;
  limpiar: (userId: string) => Promise<void>;
  refrescarEstado: () => Promise<void>;
  sincronizarAhora: () => Promise<void>;
  reintentar: (sequence: number) => Promise<void>;
  descartar: (sequence: number) => Promise<void>;
}

let usuarioActual: string | null = null;
let desuscribir: (() => void) | null = null;

function idsAfectados(cola: RegistroCola[]): {
  lotes: string[];
  eventos: Record<string, number>;
} {
  const lotes = new Set<string>();
  const eventos: Record<string, number> = {};
  for (const item of cola) {
    if (item.payload.tipo === 'registrar_cosecha') {
      lotes.add(item.payload.id);
    } else {
      lotes.add(item.payload.lote_id);
      eventos[item.payload.lote_id] = (eventos[item.payload.lote_id] ?? 0) + 1;
    }
  }
  return { lotes: [...lotes], eventos };
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isOnline: true,
  sincronizando: false,
  pendientes: [],
  conflictos: [],
  pendingCount: 0,
  lotesConPendientes: [],
  eventosPendientes: {},
  ultimoIntento: null,
  error: null,

  inicializar: async (userId) => {
    usuarioActual = userId;
    await offline.inicializar(userId);
    if (!desuscribir) {
      desuscribir = offline.onCambio(() => {
        void get().refrescarEstado();
      });
    }
    await get().refrescarEstado();
  },

  limpiar: async (userId) => {
    await offline.cerrarSesion(userId);
    usuarioActual = null;
    set({
      pendientes: [],
      conflictos: [],
      pendingCount: 0,
      lotesConPendientes: [],
      eventosPendientes: {},
      ultimoIntento: null,
      error: null,
    });
  },

  refrescarEstado: async () => {
    if (!usuarioActual) return;
    const cola = await offline.listarCola(usuarioActual);
    const pendientes = cola.filter((item) => item.estado === 'pendiente');
    const conflictos = cola.filter((item) => item.estado === 'conflicto');
    const { lotes, eventos } = idsAfectados([...pendientes, ...conflictos]);
    set({
      isOnline: offline.esOnline(),
      pendientes,
      conflictos,
      pendingCount: pendientes.length,
      lotesConPendientes: lotes,
      eventosPendientes: eventos,
    });
  },

  sincronizarAhora: async () => {
    if (!usuarioActual || get().sincronizando) return;
    set({ sincronizando: true, error: null });
    try {
      const resumen = await offline.sincronizarAhora();
      if (resumen.ok > 0) await refrescarFuentes();
    } catch {
      set({ error: 'No se pudo sincronizar. Revisa tu conexión.' });
    } finally {
      set({ sincronizando: false, ultimoIntento: new Date().toISOString() });
      await get().refrescarEstado();
    }
  },

  reintentar: async (sequence) => {
    if (!usuarioActual || get().sincronizando) return;
    set({ sincronizando: true, error: null });
    try {
      const resumen = await offline.reintentar(usuarioActual, sequence);
      if (resumen.ok > 0) await refrescarFuentes();
    } catch {
      set({ error: 'No se pudo reintentar la operación.' });
    } finally {
      set({ sincronizando: false, ultimoIntento: new Date().toISOString() });
      await get().refrescarEstado();
    }
  },

  descartar: async (sequence) => {
    await offline.descartar(sequence);
    await get().refrescarEstado();
  },
}));
