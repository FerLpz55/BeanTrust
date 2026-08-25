/**
 * Preferencia de tema (F14 — "Modo oscuro" real en Ajustes).
 *
 * `automatico` sigue al sistema (comportamiento previo, sin cambios); `claro`
 * y `oscuro` fuerzan el esquema. Persistido igual que la sesión (SecureStore
 * / fallback en memoria en web, `src/storage/secure.ts`).
 */

import { create } from 'zustand';

import { getItem, setItem } from '@/src/storage/secure';

export type PreferenciaTema = 'automatico' | 'claro' | 'oscuro';

const TEMA_KEY = 'bt.tema';

interface TemaState {
  preferencia: PreferenciaTema;
  cargarPreferencia: () => Promise<void>;
  ciclarPreferencia: () => void;
}

function esPreferenciaValida(valor: string | null): valor is PreferenciaTema {
  return valor === 'automatico' || valor === 'claro' || valor === 'oscuro';
}

const ORDEN: PreferenciaTema[] = ['automatico', 'claro', 'oscuro'];

export const useTemaStore = create<TemaState>((set, get) => ({
  preferencia: 'automatico',

  cargarPreferencia: async () => {
    const guardada = await getItem(TEMA_KEY);
    if (esPreferenciaValida(guardada)) set({ preferencia: guardada });
  },

  ciclarPreferencia: () => {
    const actual = get().preferencia;
    const siguiente = ORDEN[(ORDEN.indexOf(actual) + 1) % ORDEN.length];
    set({ preferencia: siguiente });
    void setItem(TEMA_KEY, siguiente);
  },
}));
