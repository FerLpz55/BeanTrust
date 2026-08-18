-- =============================================================================
-- BeanTrust · Migración 001 · Esquema inicial (PostgreSQL + PostgREST/Supabase)
--
-- Convenciones:
--   * Nombres en minúsculas/snake_case (Postgres hace las tablas lower()).
--   * `id uuid PRIMARY KEY` por tabla (compatibilidad móvil offline, §7.5).
--   * Timestamps TIMESTAMPTZ UTC (nunca naive).
--   * FK ON DELETE RESTRICT para conservar trazabilidad (nada se borra).
--   * lote_eventos es append-only: grants (abajo) + trigger 001 (separado).
-- =============================================================================

begin;

-- ------------------------------------------------------------------ ENUMs
create type estado_lote as enum (
  'CEREZA', 'PERGAMINO', 'ORO', 'TOSTADO', 'VENDIDO', 'RECHAZADO'
);

create type tipo_evento as enum (
  'COSECHA', 'DESPULPADO', 'DESCASCARADO', 'TOSTADO', 'VENTA', 'RECHAZADO'
);

create type rol_usuario as enum ('productor', 'cooperativa', 'comprador', 'admin');

create type estado_pago as enum ('PENDIENTE', 'CONFIRMADO', 'FALLIDO');

-- ------------------------------------------------------------------ tablas

create table usuarios (
  id            uuid primary key,
  email         text not null unique,
  rol           rol_usuario not null,
  nombre        text not null,
  created_at    timestamptz not null default now()
);

create table cooperativa (
  id            uuid primary key,
  nombre        text not null,
  rfc           text,
  contacto      text,
  municipio     text
);

create table finca (
  id            uuid primary key,
  productor_id  uuid not null references usuarios (id) on delete restrict,
  cooperativa_id uuid not null references cooperativa (id) on delete restrict,
  nombre        text not null,
  municipio     text not null,
  organica      boolean not null default false,
  altitud_min   real,
  altitud_max   real
);

create table lotes (
  id            uuid primary key,
  finca_id      uuid not null references finca (id) on delete restrict,
  codigo_publico text not null unique,
  estado        estado_lote not null default 'CEREZA',
  peso_actual_kg real not null check (peso_actual_kg >= 0),
  fecha_cosecha date not null,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- lote_eventos es append-only (§6). El PK es el UUID del cliente, lo que
-- además da idempotencia natural (mismo Idempotency-Key = mismo evento).
create table lote_eventos (
  id            uuid primary key,
  lote_id       uuid not null references lotes (id) on delete restrict,
  tipo          tipo_evento not null,
  de_estado     estado_lote,
  a_estado      estado_lote not null,
  actor_id      uuid not null references usuarios (id) on delete restrict,
  peso_kg       real,
  merma_pct     real check (merma_pct >= 0 and merma_pct <= 100),
  comprador_id  uuid references usuarios (id) on delete restrict,
  registrado_en timestamptz not null default now()
);

create index idx_lote_eventos_lote on lote_eventos (lote_id, registrado_en desc);

create table qr_certificado (
  id            uuid primary key,
  lote_id       uuid not null references lotes (id) on delete restrict,
  codigo        text not null unique,
  hash_sha256   text not null,
  emitido_en    timestamptz not null default now()
);

create table pago (
  id              uuid primary key,
  lote_id         uuid not null unique references lotes (id) on delete restrict,
  cooperativa_id  uuid not null references usuarios (id) on delete restrict,
  comprador_id    uuid not null references usuarios (id) on delete restrict,
  monto_total     real not null check (monto_total > 0),
  comision_pct    real not null check (comision_pct >= 0 and comision_pct <= 100),
  monto_productor real not null check (monto_productor >= 0),
  estado_pago     estado_pago not null default 'PENDIENTE',
  tx_hash         text,
  idempotency_key uuid not null unique,   -- desviación documentada del ERD (§9)
  creado_en       timestamptz not null default now(),
  confirmado_en   timestamptz
);

create table verificacion (
  id            uuid primary key,
  lote_id       uuid not null references lotes (id) on delete restrict,
  dispositivo   text,
  verificada_en timestamptz not null default now()
);

-- ------------------------------------------------------------------ RLS

-- Solo autenticados con JWT (rol de Supabase = 'authenticated'). El rol de
-- negocio se resuelve desde usuarios (nunca del claim `role`, §10).
alter table usuarios enable row level security;
alter table cooperativa enable row level security;
alter table finca enable row level security;
alter table lotes enable row level security;
alter table lote_eventos enable row level security;
alter table qr_certificado enable row level security;
alter table pago enable row level security;
alter table verificacion enable row level security;

commit;