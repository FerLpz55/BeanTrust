/**
 * Store de Zustand para el estado del wizard de registro de nuevo lote (draft).
 */

import { create } from 'zustand';

interface LoteDraftState {
  step: 1 | 2 | 3 | 'success';
  variedad: string | null;
  metodo_beneficiado: string | null;
  peso_kg: number | null;
  evidencia_url: string | null;
  evidencia_sha256: string | null;
  
  setVariedad: (v: string) => void;
  setMetodo: (m: string) => void;
  setPeso: (p: number) => void;
  setEvidencia: (url: string, sha256: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
  canAdvance: () => boolean;
}

export const useLoteDraft = create<LoteDraftState>((set, get) => ({
  step: 1,
  variedad: null,
  metodo_beneficiado: null,
  peso_kg: null,
  evidencia_url: null,
  evidencia_sha256: null,
  
  setVariedad: (v) => set({ variedad: v }),
  setMetodo: (m) => set({ metodo_beneficiado: m }),
  setPeso: (p) => set({ peso_kg: p }),
  setEvidencia: (url, sha256) => set({ evidencia_url: url, evidencia_sha256: sha256 }),
  
  nextStep: () => set((state) => {
    if (state.step === 1) return { step: 2 };
    if (state.step === 2) return { step: 3 };
    if (state.step === 3) return { step: 'success' };
    return state;
  }),
  
  prevStep: () => set((state) => {
    if (state.step === 2) return { step: 1 };
    if (state.step === 3) return { step: 2 };
    return state;
  }),
  
  reset: () => set({
    step: 1,
    variedad: null,
    metodo_beneficiado: null,
    peso_kg: null,
    evidencia_url: null,
    evidencia_sha256: null,
  }),
  
  canAdvance: () => {
    const s = get();
    if (s.step === 1) return s.variedad !== null && s.metodo_beneficiado !== null;
    if (s.step === 2) return s.peso_kg !== null && s.peso_kg > 0 && !isNaN(s.peso_kg);
    if (s.step === 3) return true; // Evidence is optional
    return false;
  }
}));
