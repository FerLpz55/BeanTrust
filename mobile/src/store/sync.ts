/**
 * Estado de sincronización offline (Zustand).
 * Lleva cuenta de lotes pendientes por subir y estado de red.
 */

import { create } from 'zustand';

export interface PendingItem {
  id: string;
  codigo: string;
  tipo: 'lote' | 'evento';
  creadoEn: string;
}

interface SyncState {
  pendingCount: number;
  pendingItems: PendingItem[];
  isOnline: boolean;
  addPending: (item: Omit<PendingItem, 'creadoEn'>) => void;
  removePending: (id: string) => void;
  setOnline: (online: boolean) => void;
}

// Sin pendientes por defecto: la sincronización offline real aún no está
// conectada (§ mocks), así que no simulamos un lote pendiente aquí.
const INITIAL_PENDING: PendingItem[] = [];

export const useSyncStore = create<SyncState>((set) => ({
  pendingCount: INITIAL_PENDING.length,
  pendingItems: INITIAL_PENDING,
  isOnline: false,
  addPending: (item) =>
    set((state) => {
      const nuevo = { ...item, creadoEn: new Date().toISOString() };
      const pendingItems = [...state.pendingItems, nuevo];
      return { pendingItems, pendingCount: pendingItems.length };
    }),
  removePending: (id) =>
    set((state) => {
      const pendingItems = state.pendingItems.filter((p) => p.id !== id);
      return { pendingItems, pendingCount: pendingItems.length };
    }),
  setOnline: (online) => set({ isOnline: online }),
}));
