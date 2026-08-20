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

const INITIAL_PENDING: PendingItem[] = [
  {
    id: 'lote-402',
    codigo: 'Lote #402',
    tipo: 'lote',
    creadoEn: '2026-08-19T14:22:00Z',
  },
];

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
