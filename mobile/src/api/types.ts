/**
 * Contrato tipado con el backend FastAPI.
 *
 * Espejo de `Backend/app/schemas/`. Si el backend cambia un schema, este
 * archivo debe cambiar en el mismo PR (regla docs↔código de `AGENTS.md`).
 */

/* ── Auth ──────────────────────────────────────────────── */

export type Rol = 'productor' | 'cooperativa' | 'comprador' | 'admin';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
}

/** `GET /v1/auth/me` — el rol real se resuelve en el backend, no del JWT. */
export interface CurrentUser {
  id: string;
  rol: Rol;
  email: string | null;
}

/** `GET /v1/compradores` (cooperativa/admin): directorio para elegir a quién vender. */
export interface UsuarioRead {
  id: string;
  email: string;
  rol: Rol;
  nombre: string;
}

export interface RecoverResponse {
  mensaje: string;
  /** Solo en desarrollo (sin envío de correo). */
  token_dev: string | null;
}

/* ── Fincas (B15) ──────────────────────────────────────── */

export interface FincaRead {
  id: string;
  nombre: string;
  municipio: string;
  organica: boolean;
  altitud_min: number | null;
  altitud_max: number | null;
}

/* ── Lotes ─────────────────────────────────────────────── */

export type Estado = 'CEREZA' | 'PERGAMINO' | 'ORO' | 'TOSTADO' | 'VENDIDO' | 'RECHAZADO';

export type TipoEvento =
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

/** Campos por sub-etapa (ADR-12). Todos opcionales según el tipo. */
export interface EventoCampos {
  peso_kg?: number;
  merma_pct?: number;
  metodo_beneficiado?: string;
  metodo_fermentacion?: string;
  fermentacion_horas?: number;
  humedad_inicial_pct?: number;
  humedad_final_pct?: number;
  metodo_secado?: string;
  dias_reposo?: number;
  puntaje_sca?: number;
  defectos?: string;
  densidad?: number;
  tamiz?: string;
}

export interface EventoCreate extends EventoCampos {
  tipo: TipoEvento;
  comprador_id?: string;
}

export interface LoteEventoRead extends EventoCampos {
  id: string;
  lote_id: string;
  tipo: TipoEvento;
  de_estado: Estado | null;
  a_estado: Estado;
  actor_id: string;
  comprador_id: string | null;
  /** Hash por etapa (ADR-11): cadena lineal anclada en el certificado. */
  hash_etapa: string | null;
  registrado_en: string;
}

export interface CertificadoRead {
  codigo: string;
  hash_sha256: string;
  emitido_en: string;
}

export interface LoteRead {
  id: string;
  finca_id: string;
  codigo_publico: string;
  estado: Estado;
  peso_actual_kg: number;
  fecha_cosecha: string;
  creado_en: string;
  actualizado_en: string;
  variedad: string | null;
  metodo_beneficiado: string | null;
  evidencia_url: string | null;
  evidencia_sha256: string | null;
  certificado: CertificadoRead | null;
}

export interface LoteDetalleRead extends LoteRead {
  historial: LoteEventoRead[];
}

export interface LoteCreate {
  /** UUID generado en el móvil: deduplica el alta offline (§6, "No (da id)"). */
  id?: string;
  finca_id: string;
  fecha_cosecha: string;
  peso_kg: number;
  variedad?: string | null;
  metodo_beneficiado?: string | null;
  /**
   * Evidencia ya subida (`POST /v1/evidencias`) referenciada por id. La url y
   * el sha256 los resuelve el backend desde la fila, nunca del cuerpo (ADR-14).
   */
  evidencia_id?: string | null;
}

/* ── Evidencia fotográfica privada (ADR-14) ────────────── */

export type TipoImagen = 'image/jpeg' | 'image/png' | 'image/webp';
export type EstadoEvidencia = 'PENDIENTE' | 'ADJUNTA';

/** Respuesta de `POST /v1/evidencias` (multipart). */
export interface EvidenciaRead {
  id: string;
  lote_id: string;
  finca_id: string;
  /**
   * `storage_key` privado del objeto (no es una URL pública ni firmada): solo
   * el subidor la necesita para referenciarla luego en el alta del lote.
   */
  evidencia_url: string;
  evidencia_sha256: string;
  content_type: TipoImagen;
  size_bytes: number;
  estado: EstadoEvidencia;
}

/** Respuesta de `GET /v1/lotes/{lote_id}/evidencia` (URL firmada ~10 min). */
export interface EvidenciaUrlRead {
  url: string;
  expira_en: string;
  evidencia_sha256: string;
}

/* ── Paginación por cursor ─────────────────────────────── */

export interface Pagina<T> {
  items: T[];
  next_cursor: string | null;
}

/* ── Verificación pública (§8) ─────────────────────────── */

export interface LoteEventoPublico extends EventoCampos {
  id: string;
  lote_id: string;
  tipo: TipoEvento;
  de_estado: Estado | null;
  a_estado: Estado;
  hash_etapa: string | null;
  registrado_en: string;
}

export interface VerificarRead {
  codigo: string;
  lote_id: string;
  estado: Estado;
  fecha_cosecha: string;
  finca_id: string;
  peso_actual_kg: number;
  hash_sha256: string;
  emitido_en: string;
  historial: LoteEventoPublico[];
  variedad: string | null;
  metodo_beneficiado: string | null;
  altitud_min: number | null;
  altitud_max: number | null;
  humedad_final_pct: number | null;
  puntaje_sca: number | null;
  productor_nombre: string | null;
  finca_nombre: string | null;
  municipio: string | null;
  organica: boolean | null;
}

/* ── Pagos y propinas (§9) ─────────────────────────────── */

export type EstadoPago = 'PENDIENTE' | 'CONFIRMADO' | 'FALLIDO';
export type EstadoPropina = 'REGISTRADA' | 'PENDIENTE' | 'CONFIRMADA';

/** Entrada de `POST /v1/pagos` (rol cooperativa): venta que dispara el pago simulado. */
export interface PagoCreate {
  lote_id: string;
  comprador_id: string;
  monto_total: number;
}

export interface PagoRead {
  id: string;
  lote_id: string;
  cooperativa_id: string;
  comprador_id: string;
  monto_total: number;
  comision_pct: number;
  monto_productor: number;
  estado_pago: EstadoPago;
  tx_hash: string | null;
  creado_en: string;
}

/** `GET /v1/pagos/saldo` (B13). Dinero simulado: web3 en pausa (B7). */
export interface SaldoRead {
  saldo_total: number;
  total_pagos: number;
  total_propinas: number;
  moneda: string;
}

export interface PropinaListRead {
  id: string;
  lote_id: string;
  monto: number;
  moneda: string;
  estado_propina: EstadoPropina;
  creado_en: string;
}

export interface PropinaRead extends PropinaListRead {
  comprador_id: string;
  productor_id: string;
  clave_idempotencia: string | null;
  tx_hash: string | null;
  actualizado_en: string;
}

/** `GET /v1/mercado/{lote_id}` (B16): Panel Comercio Justo, read-only (ADR-9). */
export interface MercadoLoteRead {
  lote_id: string;
  codigo_publico: string;
  variedad: string | null;
  metodo_beneficiado: string | null;
  peso_actual_kg: number;
  monto_total: number;
  comision_pct: number;
  monto_productor: number;
  monto_plataforma: number;
  estado_pago: EstadoPago;
  total_propinas: number;
  propinas: PropinaListRead[];
  productor_nombre: string | null;
  finca_nombre: string | null;
  finca_municipio: string | null;
}
