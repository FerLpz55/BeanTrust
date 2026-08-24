/**
 * Estado de lotes (Zustand). Memoria con mocks enriquecidos;
 * conecta a Supabase + SQLite offline en B11.
 */

import { create } from 'zustand';

/* ── Tipos ─────────────────────────────────────────────── */

export type LoteEstado =
  | 'CEREZA'
  | 'PERGAMINO'
  | 'ORO'
  | 'TOSTADO'
  | 'VENDIDO'
  | 'RECHAZADO';

export type EventoTipo =
  | 'COSECHA'
  | 'LIMPIEZA'
  | 'DESPULPADO'
  | 'FERMENTACION'
  | 'LAVADO'
  | 'SECADO'
  | 'REPOSO'
  | 'DESCASCARADO'
  | 'CLASIFICACION'
  | 'TOSTADO'
  | 'VENTA'
  | 'RECHAZADO';

/** Orden canónico de la cadena de trazabilidad (sin RECHAZADO, que es terminal). */
export const EVENTO_ORDEN: EventoTipo[] = [
  'COSECHA',
  'LIMPIEZA',
  'DESPULPADO',
  'FERMENTACION',
  'LAVADO',
  'SECADO',
  'REPOSO',
  'DESCASCARADO',
  'CLASIFICACION',
  'TOSTADO',
  'VENTA',
];

/** Icono MaterialIcons por tipo de evento. */
export const EVENTO_ICONO: Record<EventoTipo, string> = {
  COSECHA: 'eco',
  LIMPIEZA: 'cleaning_services',
  DESPULPADO: 'settings',
  FERMENTACION: 'science',
  LAVADO: 'water_drop',
  SECADO: 'wb_sunny',
  REPOSO: 'hourglass_empty',
  DESCASCARADO: 'grain',
  CLASIFICACION: 'filter_list',
  TOSTADO: 'local_cafe',
  VENTA: 'shopping_cart',
  RECHAZADO: 'cancel',
};

/** Descripción humana corta por tipo de evento. */
export const EVENTO_DESCRIPCION: Record<EventoTipo, string> = {
  COSECHA: 'Recolección de cerezas',
  LIMPIEZA: 'Limpieza y clasificación',
  DESPULPADO: 'Despulpado mecánico',
  FERMENTACION: 'Fermentación controlada',
  LAVADO: 'Lavado con agua limpia',
  SECADO: 'Secado en camas africanas',
  REPOSO: 'Reposo en bodega',
  DESCASCARADO: 'Trillado y descascarado',
  CLASIFICACION: 'Clasificación por tamaño',
  TOSTADO: 'Tostado de especialidad',
  VENTA: 'Venta al comprador',
  RECHAZADO: 'Lote rechazado',
};

export interface LoteEvento {
  id: string;
  tipo: EventoTipo;
  fecha: string;
  descripcion: string;
  hash_etapa: string;
  completed: boolean;
}

export interface Lote {
  id: string;
  codigo: string;
  codigo_publico: string;
  variedad: string;
  metodo: string;
  evidencia: string[];
  hash_etapa: string;
  hash_sha256: string;
  estado: LoteEstado;
  peso_actual_kg: number;
  fecha_cosecha: string;
  certificado: boolean;
  altitud_min?: number;
  altitud_max?: number;
  humedad_final_pct?: number;
  puntaje_sca?: number;
  productor_nombre?: string;
  finca_nombre?: string;
  finca_municipio?: string;
  historial: LoteEvento[];
  emitido_en?: string;
}

/* ── Helpers ───────────────────────────────────────────── */

/** Genera un hash mock determinista a partir de un seed. */
function mockHash(seed: string): string {
  const c = '0123456789abcdef';
  let h = '';
  for (let i = 0; i < 64; i++) {
    h += c[(seed.charCodeAt(i % seed.length) + i * 7) % 16];
  }
  return h;
}

function shortHash(full: string): string {
  return `0x${full.slice(0, 4)}...${full.slice(-4)}`;
}

/**
 * Genera historial de eventos hasta cierto índice del flujo canónico.
 * Eventos con índice <= completedUpTo quedan como completed.
 */
function generarHistorial(loteId: string, completedUpTo: number, baseDate: string): LoteEvento[] {
  const base = new Date(baseDate).getTime();
  const DOS_DIAS = 2 * 24 * 60 * 60 * 1000;

  return EVENTO_ORDEN.map((tipo, i) => {
    const done = i <= completedUpTo;
    return {
      id: `ev-${loteId}-${i + 1}`,
      tipo,
      fecha: done ? new Date(base + i * DOS_DIAS).toISOString() : '',
      descripcion: done ? EVENTO_DESCRIPCION[tipo] : '',
      hash_etapa: done ? mockHash(`${loteId}-${tipo}`) : '',
      completed: done,
    };
  });
}

/** Mapa de estado → cuántos eventos están completados en el flujo canónico. */
const ESTADO_COMPLETED_INDEX: Record<Exclude<LoteEstado, 'RECHAZADO'>, number> = {
  CEREZA: 0,
  PERGAMINO: 4,
  ORO: 8,
  TOSTADO: 9,
  VENDIDO: 10,
};

/* ── Mock data ─────────────────────────────────────────── */

const MOCK_LOTES: Lote[] = [
  {
    id: 'lote-401',
    codigo: 'Lote #401',
    codigo_publico: 'BTR-2024-0042',
    variedad: 'Bourbon',
    metodo: 'Lavado',
    evidencia: [],
    hash_etapa: shortHash(mockHash('lote-401-root')),
    hash_sha256: mockHash('lote-401-root'),
    estado: 'ORO',
    peso_actual_kg: 120.5,
    fecha_cosecha: '2026-08-10T08:00:00Z',
    certificado: true,
    altitud_min: 1450,
    altitud_max: 1620,
    humedad_final_pct: 11.2,
    puntaje_sca: 86,
    productor_nombre: 'Carlos Mendoza',
    finca_nombre: 'Finca El Roble',
    finca_municipio: 'Huehuetenango',
    emitido_en: '2026-08-20T10:00:00Z',
    historial: generarHistorial('lote-401', ESTADO_COMPLETED_INDEX.ORO, '2026-08-10T08:00:00Z'),
  },
  {
    id: 'lote-402',
    codigo: 'Lote #402',
    codigo_publico: 'BTR-2024-0055',
    variedad: 'Caturra',
    metodo: 'Honey',
    evidencia: [],
    hash_etapa: shortHash(mockHash('lote-402-root')),
    hash_sha256: mockHash('lote-402-root'),
    estado: 'CEREZA',
    peso_actual_kg: 85.0,
    fecha_cosecha: '2026-08-22T06:30:00Z',
    certificado: false,
    altitud_min: 1350,
    altitud_max: 1500,
    productor_nombre: 'Carlos Mendoza',
    finca_nombre: 'Finca El Roble',
    finca_municipio: 'Huehuetenango',
    historial: generarHistorial('lote-402', ESTADO_COMPLETED_INDEX.CEREZA, '2026-08-22T06:30:00Z'),
  },
  {
    id: 'lote-403',
    codigo: 'Lote #403',
    codigo_publico: 'BTR-2024-0128',
    variedad: 'Typica',
    metodo: 'Natural',
    evidencia: [],
    hash_etapa: shortHash(mockHash('lote-403-root')),
    hash_sha256: mockHash('lote-403-root'),
    estado: 'TOSTADO',
    peso_actual_kg: 45.2,
    fecha_cosecha: '2026-07-20T09:00:00Z',
    certificado: true,
    altitud_min: 1550,
    altitud_max: 1700,
    humedad_final_pct: 10.8,
    puntaje_sca: 88,
    productor_nombre: 'Carlos Mendoza',
    finca_nombre: 'Finca El Roble',
    finca_municipio: 'Huehuetenango',
    emitido_en: '2026-08-15T14:00:00Z',
    historial: generarHistorial('lote-403', ESTADO_COMPLETED_INDEX.TOSTADO, '2026-07-20T09:00:00Z'),
  },
  {
    id: 'lote-404',
    codigo: 'Lote #404',
    codigo_publico: 'BTR-2024-0091',
    variedad: 'Geisha',
    metodo: 'Lavado',
    evidencia: [],
    hash_etapa: shortHash(mockHash('lote-404-root')),
    hash_sha256: mockHash('lote-404-root'),
    estado: 'PERGAMINO',
    peso_actual_kg: 200.0,
    fecha_cosecha: '2026-08-15T07:00:00Z',
    certificado: false,
    altitud_min: 1600,
    altitud_max: 1800,
    productor_nombre: 'Carlos Mendoza',
    finca_nombre: 'Finca El Roble',
    finca_municipio: 'Huehuetenango',
    historial: generarHistorial('lote-404', ESTADO_COMPLETED_INDEX.PERGAMINO, '2026-08-15T07:00:00Z'),
  },
  {
    id: 'lote-405',
    codigo: 'Lote #405',
    codigo_publico: 'BTR-2024-0033',
    variedad: 'Bourbon',
    metodo: 'Semilavado',
    evidencia: [],
    hash_etapa: shortHash(mockHash('lote-405-root')),
    hash_sha256: mockHash('lote-405-root'),
    estado: 'VENDIDO',
    peso_actual_kg: 95.0,
    fecha_cosecha: '2026-06-01T08:00:00Z',
    certificado: true,
    altitud_min: 1400,
    altitud_max: 1550,
    humedad_final_pct: 11.5,
    puntaje_sca: 84,
    productor_nombre: 'Carlos Mendoza',
    finca_nombre: 'Finca El Roble',
    finca_municipio: 'Huehuetenango',
    emitido_en: '2026-07-10T09:00:00Z',
    historial: generarHistorial('lote-405', ESTADO_COMPLETED_INDEX.VENDIDO, '2026-06-01T08:00:00Z'),
  },
  {
    id: 'lote-406',
    codigo: 'Lote #406',
    codigo_publico: 'BTR-2024-0067',
    variedad: 'Caturra',
    metodo: 'Lavado',
    evidencia: [],
    hash_etapa: shortHash(mockHash('lote-406-root')),
    hash_sha256: mockHash('lote-406-root'),
    estado: 'RECHAZADO',
    peso_actual_kg: 30.0,
    fecha_cosecha: '2026-07-05T07:00:00Z',
    certificado: false,
    productor_nombre: 'Carlos Mendoza',
    finca_nombre: 'Finca El Roble',
    finca_municipio: 'Huehuetenango',
    historial: [
      // 3 etapas completadas antes de rechazo
      ...generarHistorial('lote-406', 2, '2026-07-05T07:00:00Z').slice(0, 3),
      {
        id: 'ev-lote-406-r',
        tipo: 'RECHAZADO' as EventoTipo,
        fecha: '2026-07-12T11:00:00Z',
        descripcion: 'Contaminación detectada en despulpado',
        hash_etapa: mockHash('lote-406-rechazado'),
        completed: true,
      },
    ],
  },
];

/* ── Store ─────────────────────────────────────────────── */

interface LotesState {
  lotes: Lote[];
  isLoading: boolean;
  addLote: (draft: {
    variedad: string;
    metodo: string;
    peso_actual_kg: number;
    evidencia?: string[];
    fecha_cosecha?: string;
  }) => void;
}

export const useLotesStore = create<LotesState>((set) => ({
  lotes: MOCK_LOTES,
  isLoading: false,
  addLote: (draft) =>
    set((state) => {
      const num = 400 + state.lotes.length + 1;
      const id = `lote-${num}`;
      const codigo = `Lote #${num}`;
      const yr = new Date().getFullYear();
      const codigo_publico = `BTR-${yr}-${String(num).padStart(4, '0')}`;
      const hash_sha256 = mockHash(`${id}-root`);
      const ahora = draft.fecha_cosecha ?? new Date().toISOString();

      const lote: Lote = {
        id,
        codigo,
        codigo_publico,
        variedad: draft.variedad,
        metodo: draft.metodo,
        evidencia: draft.evidencia ?? [],
        hash_etapa: shortHash(hash_sha256),
        hash_sha256,
        estado: 'CEREZA',
        peso_actual_kg: draft.peso_actual_kg,
        fecha_cosecha: ahora,
        certificado: false,
        historial: [
          {
            id: `ev-${id}-1`,
            tipo: 'COSECHA',
            fecha: ahora,
            descripcion: EVENTO_DESCRIPCION.COSECHA,
            hash_etapa: mockHash(`${id}-COSECHA`),
            completed: true,
          },
        ],
      };
      return { lotes: [lote, ...state.lotes] };
    }),
}));
