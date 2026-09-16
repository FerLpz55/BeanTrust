# Reporte IA — Verificación del plan revisado de cierre (15 sep 2026)

Revisión de solo lectura del plan corregido contra el código actual:
migraciones, endpoints, dependencias, triggers, Edge Function y CI. Objetivo:
separar errores reales de falsos positivos antes de ejecutar.

---

## Correcto — falsos positivos o ya resueltos

- **`adjuntada_en` se conserva**: es el reloj de la evidencia, no entra al
  hash. Bien corregido.
- **Backup externo durable**: resuelto. `CREATE TABLE AS SELECT` in-txn
  desaparece en rollback; el dump externo es el respaldo real.
- **Canal de ejecución con owner**: correcto. Los triggers
  `lote_eventos_no_update`/`lote_eventos_no_delete`
  (`Backend/db/migrations/003_integridad.sql:21,25`) son del owner;
  `service_role`/PostgREST no pueden `DISABLE TRIGGER`. `psql` con conexión
  directa es el canal válido.
- **Las 6 rutas de mantenimiento existen y coinciden exactamente**:
  `/v1/pagos` (`app/api/v1/endpoints/pagos.py:26`), `/v1/propinas`
  (`pagos.py:83`), `/v1/lotes` (`lotes.py:22`),
  `/v1/lotes/{lote_id}/eventos` (`eventos.py:13`), `/v1/sync` (`sync.py:24`),
  `/v1/evidencias` (`evidencias.py:24`). Sin error.
- **`Backend/app/dependencies.py` es el lugar correcto**: ahí vive
  `require_rol` (`dependencies.py:486`).
- **Desactivar “solo los append-only”**: correcto; hay otros dos triggers
  (`lote_eventos_tocar_lote`, `lote_eventos_validar_venta`, `003:39,58`) que
  deben seguir activos.
- **Edge Function y cron existen**:
  `supabase/functions/purge-staged-evidence/index.ts` + `index_test.ts`, cron
  `purge-staged-evidence-daily` (`007:7`). Los tres casos de test del plan ya
  están en `index_test.ts:95,100,108`.
- **Flags del dump válidos**: `--data-only --schema --file` existen en la CLI
  2.115.0.

---

## Errores reales que siguen en el plan

1. **`GET DIAGNOSTICS` no es SQL plano.** Es exclusivo de PL/pgSQL. En un
   script `psql -f` no puedes escribir `UPDATE; GET DIAGNOSTICS v = ROW_COUNT;`.
   El generador debe emitir **bloques `DO $$ ... $$`** (uno por
   update+bitácora, o un `DO` único que recorra una lista `VALUES`). Tal como
   está redactada la sección 2, pasos 6–7, no es ejecutable.
2. **Ubicación del test de round-trip.** `Backend/tests/unit/` mockea el cliente
   Supabase; no hay BD. Un round-trip real que “llame la RPC y lea el evento
   persistido” va en pgTAP (`supabase/tests/integridad_evidencia.test.sql`) o en
   `Backend/tests/integration`. El unitario solo puede afirmar que el payload
   lleva `p_registrado_en`. Hay que dividirlo o `pytest` no podrá ejecutarlo.
3. **`--schema public` no respalda `app_private`.** La reparación inserta en
   `app_private.reparacion_cadena_evento`; si el backup es solo `public`, no
   puedes restaurar la bitácora. Usa `--schema public,app_private` (o segundo
   dump).
4. **`deno test --allow-env` puede fallar en caché fría.** El propio test
   importa `jsr:@std/assert@1` y su cabecera dice `--allow-env --allow-net`
   (`index_test.ts:1-2`). Además `deno` no está instalado localmente
   (`which deno` vacío) y **no existe job de Edge en
   `.github/workflows/ci.yml`**: la etapa es scope nuevo, necesita instalar
   deno y `--allow-net` (o cachear el import).

---

## Imprecisiones menores

- **“la RPC puede seguir usando `clock_timestamp()`”**: hoy usa `now()`
  (`008:160,193,208`; `009:91,129,144`). Si quieres reloj de sentencia es un
  cambio deliberado; si no, escribe `now()`.
- **“Eliminar la firma de 10 argumentos”**: hazlo explícito con
  `DROP FUNCTION public.registrar_cosecha_con_evidencia(uuid,uuid,uuid,text,date,double precision,text,text,uuid,text);`
  (no `create or replace`), antes del wrapper de 11 args. Actualiza también las
  aserciones de grants del pgTAP (`:55,62`) y todas las llamadas
  (`:110,140,155,165,180,194,203,230`).
- **`NOTIFY pgrst`**: se encola hasta el commit; asegúrate de que 010 use el
  patrón `begin;…commit;` de 008/009.
- **Falta el comando de aplicación de 010**: la sección 4 dice “aplicar
  migración 010” pero no nombra `supabase db push --linked` (el `--dry-run`
  solo está en la sección 6).

---

## Qué debe entrar al plan de cierre

**Mantener:** backup externo durable, canal owner con `psql`, dependencia de
mantenimiento, las 6 rutas, `adjuntada_en` conservado, `p_registrado_en`, corte
de bitácora por `emitido_en`, guarda de row-count y los tests/CI.

**Corregir antes de ejecutar:**

1. `DO $$` en vez de `GET DIAGNOSTICS` suelto.
2. Separar round-trip a pgTAP/integración.
3. Dump con `app_private`.
4. Instalar/cachear deno y añadir job Edge con `--allow-net`.
5. `DROP FUNCTION` explícito.
6. Aclarar `now()` vs `clock_timestamp()`.
