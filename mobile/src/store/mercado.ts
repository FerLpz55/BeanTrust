/**
 * Mercado y comercio justo (F13) — conectado al backend.
 *
 * El Panel Comercio Justo es una **proyección read-only** (`GET /v1/mercado/{id}`,
 * ADR-9/B16): la app nunca lo escribe. La única escritura es la propina
 * (`POST /v1/propinas`), idempotente por `Idempotency-Key`.
 *
 * Todo el dinero es **simulado** por `FakeGatewayPagos`: no hay pasarela de
 * pago ni blockchain (web3 en pausa, B7).
 */

import { create } from 'zustand';

import { ApiError, SesionCambiadaError } from '@/src/api/client';
import { obtenerPanelLote } from '@/src/api/mercado';
import { obtenerSaldo } from '@/src/api/pagos';
import { enviarPropina as enviarPropinaApi } from '@/src/api/propinas';
import type { MercadoLoteRead, SaldoRead } from '@/src/api/types';
import { registrarLimpiezaSesion } from '@/src/store/sesion';

interface MercadoState {
  saldo: SaldoRead | null;
  paneles: Record<string, MercadoLoteRead>;
  isLoading: boolean;
  error: string | null;
  enviando: boolean;
  cargarSaldo: () => Promise<void>;
  cargarPanel: (loteId: string) => Promise<void>;
  enviarPropina: (loteId: string, monto: number, clave: string) => Promise<void>;
  reset: () => void;
}

function mensajeDe(err: unknown, porDefecto: string): string {
  return err instanceof ApiError ? err.message : porDefecto;
}

export const useMercadoStore = create<MercadoState>((set, get) => ({
  saldo: null,
  paneles: {},
  isLoading: false,
  error: null,
  enviando: false,

  cargarSaldo: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ saldo: await obtenerSaldo(), isLoading: false });
    } catch (err) {
      if (err instanceof SesionCambiadaError) return;
      // 403 es esperado para quien no es productor (el saldo es suyo, §10).
      const sinAcceso = err instanceof ApiError && err.status === 403;
      set({
        saldo: null,
        isLoading: false,
        error: sinAcceso ? null : mensajeDe(err, 'No se pudo cargar el saldo.'),
      });
    }
  },

  cargarPanel: async (loteId) => {
    set({ isLoading: true, error: null });
    try {
      const panel = await obtenerPanelLote(loteId);
      set((s) => ({ paneles: { ...s.paneles, [loteId]: panel }, isLoading: false }));
    } catch (err) {
      if (err instanceof SesionCambiadaError) return;
      set({ isLoading: false, error: mensajeDe(err, 'No se pudo cargar el comercio justo.') });
    }
  },

  enviarPropina: async (loteId, monto, clave) => {
    set({ enviando: true, error: null });
    try {
      await enviarPropinaApi(loteId, monto, clave);
      // La proyección la materializa el backend: se recarga en vez de simularla.
      await get().cargarPanel(loteId);
    } catch (err) {
      set({ error: mensajeDe(err, 'No se pudo enviar la propina.') });
      throw err;
    } finally {
      set({ enviando: false });
    }
  },

  reset: () => set({ saldo: null, paneles: {}, isLoading: false, error: null, enviando: false }),
}));

registrarLimpiezaSesion(() => {
  useMercadoStore.getState().reset();
});
