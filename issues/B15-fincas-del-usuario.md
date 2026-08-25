# [Backend] B15: GET /v1/fincas — directorio de fincas del usuario autenticado

> **GitHub:** (pendiente de crear) · **Estado:** Done · **Label:** `backend`
> **Depende de:** — · **Desbloquea:** F10

## Contexto

`POST /v1/lotes` exige `finca_id` (`LoteCreate`) y `LoteService._autorizar_finca` valida la
titularidad, pero **no existía ningún endpoint que expusiera las fincas del usuario**.
`CurrentUser` solo tiene `id`, `rol` y `email`, así que F10 ("obtener `finca_id` vía
`GET /v1/auth/me`") era irrealizable: el contrato no lo provee.

Se eligió un endpoint dedicado en vez de añadir `finca_id` a `/auth/me` porque **un productor
puede tener varias fincas** (el seed de dev ya siembra dos para el mismo productor), y devolver
una sola forzaría una elección arbitraria.

## Alcance

- `GET /v1/fincas` con rol productor/cooperativa/admin.
- `FincaService.listar` aplica la matriz §10: productor → sus fincas; cooperativa → las de sus
  productores; comprador → 403; admin → todas. Fail-closed.
- `listar_por_productor` / `listar_por_cooperativa` / `listar_todas` en la interfaz de repos y en
  las dos implementaciones (in_memory y supabase).
- `FincaRead` no expone `productor_id` ni `cooperativa_id` (no filtra titularidad).

## Criterios de aceptación

- [x] Aislamiento por tenant probado (productor 2 fincas, cooperativa solo la suya, comprador 403).
- [x] `ruff check app tests` + `pytest` en verde (6 tests nuevos en `test_fincas.py`).
- [x] `test_contrato_api.py`, `Backend/README.md` y `docs/ARCHITECTURE.md` §6 sincronizados.

## Referencias

- `Backend/app/api/v1/endpoints/fincas.py`, `Backend/app/services/finca_service.py`
- `docs/ARCHITECTURE.md` §6, §10 (fila `finca` de la matriz RLS)
