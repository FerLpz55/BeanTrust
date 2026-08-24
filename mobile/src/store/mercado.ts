/**
 * Estado de mercado y propinas directas (Zustand).
 * F04: Comercio Justo.
 */

import { create } from 'zustand';

export interface Propina {
  id: string;
  lote_id: string;
  monto: number;
  moneda: string;
  estado: 'REGISTRADA' | 'CONFIRMADA';
  fecha: string;
  comprador_nombre?: string;
}

export interface MercadoLote {
  lote_id: string;
  variedad: string;
  metodo: string;
  peso_kg: number;
  precio_total: number;
  precio_productor: number; // 97%
  precio_plataforma: number; // 3%
  propinas: Propina[];
  productor_nombre: string;
  finca_nombre: string;
  finca_municipio: string;
  testimonio?: string;
}

interface MercadoState {
  saldo: number;
  lotes: MercadoLote[];
  isLoading: boolean;
  enviarPropina: (loteId: string, monto: number) => void;
}

const MOCK_MERCADO_LOTES: MercadoLote[] = [
  {
    lote_id: 'lote-403',
    variedad: 'Typica',
    metodo: 'Natural',
    peso_kg: 45.2,
    precio_total: 250,
    precio_productor: 242.50,
    precio_plataforma: 7.50,
    productor_nombre: 'Carlos Mendoza',
    finca_nombre: 'Finca El Roble',
    finca_municipio: 'Huehuetenango',
    testimonio: 'El comercio directo nos permite invertir en mejor infraestructura para la próxima cosecha, asegurando un futuro sostenible para nuestra familia.',
    propinas: [
      {
        id: 'prop-1',
        lote_id: 'lote-403',
        monto: 15,
        moneda: 'USD',
        estado: 'CONFIRMADA',
        fecha: '2026-08-20T10:00:00Z',
        comprador_nombre: 'Cafetería La Especial',
      }
    ],
  },
  {
    lote_id: 'lote-405',
    variedad: 'Bourbon',
    metodo: 'Semilavado',
    peso_kg: 95.0,
    precio_total: 180,
    precio_productor: 174.60,
    precio_plataforma: 5.40,
    productor_nombre: 'Carlos Mendoza',
    finca_nombre: 'Finca El Roble',
    finca_municipio: 'Huehuetenango',
    testimonio: 'Saber exactamente a dónde va nuestro café y recibir el precio justo nos motiva a mantener las prácticas tradicionales.',
    propinas: [
      {
        id: 'prop-2',
        lote_id: 'lote-405',
        monto: 25,
        moneda: 'USD',
        estado: 'CONFIRMADA',
        fecha: '2026-08-22T08:30:00Z',
        comprador_nombre: 'Tostadores del Norte',
      },
      {
        id: 'prop-3',
        lote_id: 'lote-405',
        monto: 10,
        moneda: 'USD',
        estado: 'REGISTRADA',
        fecha: '2026-08-23T14:15:00Z',
        comprador_nombre: 'Ana L.',
      }
    ],
  },
];

export const useMercadoStore = create<MercadoState>((set) => ({
  saldo: 420.00,
  lotes: MOCK_MERCADO_LOTES,
  isLoading: false,
  enviarPropina: (loteId, monto) =>
    set((state) => {
      const nuevaPropina: Propina = {
        id: `prop-${Date.now()}`,
        lote_id: loteId,
        monto,
        moneda: 'USD',
        estado: 'REGISTRADA',
        fecha: new Date().toISOString(),
        comprador_nombre: 'Tú (Comprador)',
      };

      return {
        saldo: state.saldo - monto,
        lotes: state.lotes.map((lote) =>
          lote.lote_id === loteId
            ? { ...lote, propinas: [nuevaPropina, ...lote.propinas] }
            : lote
        ),
      };
    }),
}));
