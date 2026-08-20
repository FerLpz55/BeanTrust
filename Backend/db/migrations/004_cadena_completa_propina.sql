-- =============================================================================
-- BeanTrust · Migración 004 · Cadena completa de eventos + Propina + Hash por etapa
--
-- Cambios:
-- 1. TipoEvento ampliado a 12 valores (cadena completa con autotransiciones)
-- 2. LOTE: variedad, metodo_beneficiado, evidencia_url, evidencia_sha256
-- 3. LOTE_EVENTOS: campos por sub-etapa + hash_etapa (ADR-11)
-- 4. Nueva tabla PROPINA (ADR-10): bivalente off-chain/on-chain
-- 5. Índices y RLS para nuevas tablas
-- =============================================================================

begin;

-- ------------------------------------------------------------------ ENUMs ampliados

-- Ampliación de tipo_evento (cadena completa, 12 valores)
-- Nota: Postgres no permite ALTER TYPE ... ADD VALUE si ya existe la tabla
-- con el enum, así que usamos CREATE TYPE + ALTER TABLE ... ALTER COLUMN
-- para migración segura.

-- Creamos el nuevo enum
create type tipo_evento_v2 as enum (
  'COSECHA', 'LIMPIEZA', 'DESPULPADO', 'FERMENTACION', 'LAVADO',
  'SECADO', 'REPOSO', 'DESCASCARADO', 'CLASIFICACION', 'TOSTADO',
  'VENTA', 'RECHAZADO'
);

-- Migración de lote_eventos.tipo al nuevo enum
alter table lote_eventos
  alter column tipo type tipo_evento_v2 using tipo::text::tipo_evento_v2;

-- Eliminar el enum viejo y renombrar
drop type tipo_evento;
alter type tipo_evento_v2 rename to tipo_evento;

-- Nuevo enum para estado_propina (ADR-10)
create type estado_propina as enum ('REGISTRADA', 'PENDIENTE', 'CONFIRMADA');

-- ------------------------------------------------------------------ LOTE: nuevos campos enriquecidos (ADR-12, ADR-14)

alter table lotes
  add column if not exists variedad text,
  add column if not exists metodo_beneficiado text,  -- 'lavado'|'semilavado'|'honey'|'natural'
  add column if not exists evidencia_url text,
  add column if not exists evidencia_sha256 text;

-- ------------------------------------------------------------------ LOTE_EVENTOS: campos por sub-etapa + hash_etapa (ADR-11)

alter table lote_eventos
  add column if not exists metodo_beneficiado text,        -- DESPULPADO
  add column if not exists metodo_fermentacion text,       -- DESPULPADO/FERMENTACION
  add column if not exists fermentacion_horas real,        -- FERMENTACION
  add column if not exists humedad_inicial_pct real,       -- SECADO
  add column if not exists humedad_final_pct real,         -- SECADO
  add column if not exists metodo_secado text,             -- SECADO
  add column if not exists dias_reposo real,               -- REPOSO
  add column if not exists puntaje_sca real,               -- CLASIFICACION
  add column if not exists defectos text,                  -- CLASIFICACION
  add column if not exists densidad real,                  -- CLASIFICACION
  add column if not exists tamiz text,                     -- CLASIFICACION
  add column if not exists hash_etapa text;                -- ADR-11: cadena lineal

-- CHECK constraints para nuevos campos
alter table lote_eventos
  add constraint chk_humedad_pct check (
    humedad_inicial_pct is null or (humedad_inicial_pct >= 0 and humedad_inicial_pct <= 100)
  ),
  add constraint chk_humedad_final_pct check (
    humedad_final_pct is null or (humedad_final_pct >= 0 and humedad_final_pct <= 100)
  ),
  add constraint chk_fermentacion_horas check (
    fermentacion_horas is null or fermentacion_horas >= 0
  ),
  add constraint chk_dias_reposo check (
    dias_reposo is null or dias_reposo >= 0
  ),
  add constraint chk_puntaje_sca check (
    puntaje_sca is null or (puntaje_sca >= 0 and puntaje_sca <= 100)
  ),
  add constraint chk_densidad check (
    densidad is null or densidad > 0
  );

-- Índice para consultar historial en orden (ya existe, asegurar)
create index if not exists idx_lote_eventos_lote on lote_eventos (lote_id, registrado_en desc);

-- ------------------------------------------------------------------ Tabla PROPINA (ADR-10)

create table if not exists propina (
  id                    uuid primary key,
  lote_id               uuid not null references lotes (id) on delete restrict,
  comprador_id          uuid not null references usuarios (id) on delete restrict,
  productor_id          uuid not null references usuarios (id) on delete restrict,
  monto                 real not null check (monto > 0),
  moneda                text not null default 'MXN',  -- 'MXN'|'USDC'|'MATIC'
  estado_propina        estado_propina not null default 'REGISTRADA',
  clave_idempotencia    text not null unique,   -- Idempotency-Key del cliente
  tx_hash               text,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

create index if not exists idx_propina_lote on propina (lote_id, creado_en desc);
create index if not exists idx_propina_productor on propina (productor_id, creado_en desc);
create index if not exists idx_propina_comprador on propina (comprador_id, creado_en desc);

-- ------------------------------------------------------------------ RLS para PROPINA

alter table propina enable row level security;

-- Política: el productor ve las propinas que llegan a sus fincas
create policy propina_select_productor on propina
  for select to authenticated
  using (
    exists (
      select 1 from lotes l
      join finca f on f.id = l.finca_id
      where l.id = propina.lote_id
      and f.productor_id = auth.uid()
    )
  );

-- Política: el comprador ve las propinas que él dio
create policy propina_select_comprador on propina
  for select to authenticated
  using (propina.comprador_id = auth.uid());

-- Política: admin ve todo
create policy propina_select_admin on propina
  for select to authenticated
  using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.rol = 'admin'
    )
  );

-- Política: solo el comprador (o admin via service key) inserta
create policy propina_insert_comprador on propina
  for insert to authenticated
  with check (
    propina.comprador_id = auth.uid()
    or exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

-- Política: actualización solo por poller/servicio (service key) o admin
create policy propina_update_service on propina
  for update to authenticated
  using (
    exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin')
  );

-- ------------------------------------------------------------------ RLS: fix tenant leak en lote_eventos y lotes
-- (NOTA: los repos Supabase usan service key hoy, RLS inerte.
--  Estas políticas son la intención documentada; B11 pendiente.)

-- lote_eventos: lectura anclada a lote -> finca -> productor/cooperativa
-- (ya existe política en 002_rls.sql, asegurar consistencia)

-- ------------------------------------------------------------------ Trigger actualizado_en para PROPINA

create or replace function set_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en = now();
  return new;
end $$;

drop trigger if exists trg_propina_actualizado_en on propina;
create trigger trg_propina_actualizado_en
  before update on propina
  for each row execute function set_actualizado_en();

-- ------------------------------------------------------------------ Seed actualizado: añadir fincas de prueba con altitud

-- Las fincas ya existen en seed.sql, asegurar que tengan altitud_min/max
-- (se manejan en seed.sql separado)

commit;