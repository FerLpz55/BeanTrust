/**
 * Borrador del wizard de alta de lote (F02/F10).
 *
 * Guarda también la **clave de idempotencia**: `POST /v1/lotes` no usa el
 * header `Idempotency-Key` (§6 lo marca como "No (da id)"), sino el `id` del
 * cuerpo. Se genera una vez por intención de alta y se reusa en los reintentos,
 * así un doble toque o un retry de red no crean dos lotes.
 */

import { create } from 'zustand';

import { nuevaClaveIdempotencia } from '@/src/utils/idempotencia';

interface LoteDraftState {
  step: 1 | 2 | 3 | 'success';
  /** UUID del lote generado en el móvil: deduplica el alta. */
  loteId: string;
  variedad: string | null;
  metodo_beneficiado: string | null;
  peso_kg: number | null;
  fecha_cosecha: string;
  finca_id: string | null;
  evidencia_url: string | null;
  evidencia_sha256: string | null;
  enviando: boolean;
  error: string | null;

  setVariedad: (v: string) => void;
  setMetodo: (m: string) => void;
  setPeso: (p: number) => void;
  setFechaCosecha: (f: string) => void;
  setFinca: (id: string) => void;
  setEnviando: (v: boolean) => void;
  setError: (e: string | null) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
  canAdvance: () => boolean;
}

/** Fecha de hoy en `YYYY-MM-DD`, que es lo que espera `LoteCreate`. */
function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function estadoInicial() {
  return {
    step: 1 as const,
    loteId: nuevaClaveIdempotencia(),
    variedad: null,
    metodo_beneficiado: null,
    peso_kg: null,
    fecha_cosecha: hoy(),
    finca_id: null,
    evidencia_url: null,
    evidencia_sha256: null,
    enviando: false,
    error: null,
  };
}

export const useLoteDraft = create<LoteDraftState>((set, get) => ({
  ...estadoInicial(),

  setVariedad: (v) => set({ variedad: v, error: null }),
  setMetodo: (m) => set({ metodo_beneficiado: m, error: null }),
  setPeso: (p) => set({ peso_kg: p, error: null }),
  setFechaCosecha: (f) => set({ fecha_cosecha: f, error: null }),
  setFinca: (id) => set({ finca_id: id, error: null }),
  setEnviando: (v) => set({ enviando: v }),
  setError: (e) => set({ error: e }),

  nextStep: () =>
    set((state) => {
      if (state.step === 1) return { step: 2 };
      if (state.step === 2) return { step: 3 };
      if (state.step === 3) return { step: 'success' };
      return state;
    }),

  prevStep: () =>
    set((state) => {
      if (state.step === 2) return { step: 1 };
      if (state.step === 3) return { step: 2 };
      return state;
    }),

  // Nuevo `loteId`: el siguiente alta es una intención distinta.
  reset: () => set(estadoInicial()),

  canAdvance: () => {
    const s = get();
    if (s.step === 1) {
      return s.variedad !== null && s.metodo_beneficiado !== null && s.fecha_cosecha !== '';
    }
    if (s.step === 2) return s.peso_kg !== null && s.peso_kg > 0 && !Number.isNaN(s.peso_kg);
    // Paso 3: la finca es obligatoria (`LoteCreate.finca_id`).
    if (s.step === 3) return s.finca_id !== null;
    return false;
  },
}));
