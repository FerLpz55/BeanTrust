/**
 * Modelo de vista del lote y adaptador desde el contrato del backend (F09).
 *
 * El backend devuelve **solo los eventos que ocurrieron** (`LoteEventoRead[]`,
 * con `tipo`/`de_estado`/`a_estado`/`hash_etapa`), mientras que la UI pinta la
 * cadena canónica completa de 11 etapas marcando cuáles se cumplieron.
 * Traducir aquí evita deformar cualquiera de los dos lados.
 */

import type { Estado, LoteDetalleRead, LoteEventoRead, LoteRead, TipoEvento } from '@/src/api/types';

export type LoteEstado = Estado;
export type EventoTipo = TipoEvento;

/** Orden canónico de la cadena (sin RECHAZADO, que es terminal). */
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

/**
 * Lo mínimo que necesita el timeline. Lo cumplen tanto `LoteEventoRead` (detalle
 * autenticado) como `LoteEventoPublico` (pasaporte, que omite `actor_id` y
 * `comprador_id` a propósito para no filtrar datos internos).
 */
export type EventoParaTimeline = Pick<
  LoteEventoRead,
  'id' | 'tipo' | 'hash_etapa' | 'registrado_en'
>;

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
  finca_id: string;
  codigo: string;
  codigo_publico: string;
  variedad: string;
  metodo: string;
  hash_etapa: string;
  hash_sha256: string;
  estado: LoteEstado;
  peso_actual_kg: number;
  fecha_cosecha: string;
  certificado: boolean;
  /** Código del certificado QR (`BT-…`), el que escanea el consumidor. */
  codigo_certificado: string | null;
  emitido_en?: string;
  altitud_min?: number;
  altitud_max?: number;
  humedad_final_pct?: number;
  puntaje_sca?: number;
  historial: LoteEvento[];
}

function hashCorto(completo: string | null): string {
  if (!completo) return '';
  return `0x${completo.slice(0, 4)}…${completo.slice(-4)}`;
}

/** Etiqueta corta del lote a partir de su código público (`LT-XXXXXXXXXX`). */
function etiqueta(codigoPublico: string): string {
  return `Lote ${codigoPublico}`;
}

/**
 * Proyecta el historial real sobre la cadena canónica de 11 etapas.
 *
 * Los eventos que no ocurrieron quedan como pendientes (sin fecha ni hash).
 * `RECHAZADO` es terminal: si existe, se añade al final y corta la cadena.
 */
export function aTimeline(historial: EventoParaTimeline[]): LoteEvento[] {
  const porTipo = new Map<EventoTipo, EventoParaTimeline>();
  for (const evento of historial) {
    if (!porTipo.has(evento.tipo)) porTipo.set(evento.tipo, evento);
  }

  const rechazo = porTipo.get('RECHAZADO');
  const pasos = EVENTO_ORDEN.map((tipo) => {
    const real = porTipo.get(tipo);
    return {
      id: real?.id ?? `pendiente-${tipo}`,
      tipo,
      fecha: real?.registrado_en ?? '',
      descripcion: real ? EVENTO_DESCRIPCION[tipo] : '',
      hash_etapa: real?.hash_etapa ?? '',
      completed: real !== undefined,
    };
  });

  if (!rechazo) return pasos;
  // Tras un rechazo no hay continuación: se muestran las etapas cumplidas + el corte.
  return [
    ...pasos.filter((p) => p.completed),
    {
      id: rechazo.id,
      tipo: 'RECHAZADO' as EventoTipo,
      fecha: rechazo.registrado_en,
      descripcion: EVENTO_DESCRIPCION.RECHAZADO,
      hash_etapa: rechazo.hash_etapa ?? '',
      completed: true,
    },
  ];
}

/** Adapta un `LoteRead` (lista) al modelo de vista, sin historial. */
export function aLoteVista(lote: LoteRead): Lote {
  return {
    id: lote.id,
    finca_id: lote.finca_id,
    codigo: etiqueta(lote.codigo_publico),
    codigo_publico: lote.codigo_publico,
    variedad: lote.variedad ?? 'Sin especificar',
    metodo: lote.metodo_beneficiado ?? 'Sin especificar',
    hash_etapa: hashCorto(lote.certificado?.hash_sha256 ?? null),
    hash_sha256: lote.certificado?.hash_sha256 ?? '',
    estado: lote.estado,
    peso_actual_kg: lote.peso_actual_kg,
    fecha_cosecha: lote.fecha_cosecha,
    certificado: lote.certificado !== null,
    codigo_certificado: lote.certificado?.codigo ?? null,
    emitido_en: lote.certificado?.emitido_en,
    historial: [],
  };
}

/** Adapta el detalle (`LoteDetalleRead`) incluyendo el timeline proyectado. */
export function aLoteDetalleVista(lote: LoteDetalleRead): Lote {
  const ultimo = <K extends keyof LoteEventoRead>(campo: K) =>
    [...lote.historial].reverse().find((e) => e[campo] !== null && e[campo] !== undefined)?.[campo];

  return {
    ...aLoteVista(lote),
    historial: aTimeline(lote.historial),
    humedad_final_pct: ultimo('humedad_final_pct') as number | undefined,
    puntaje_sca: ultimo('puntaje_sca') as number | undefined,
  };
}
