# [Mobile] F08 — Auth completa: register real + recover real + perfil/rol con GET /v1/auth/me

> **GitHub:** [#29](https://github.com/FerLpz55/BeanTrust/issues/29) · **Estado:** Done · **Label:** —
> **Depende de:** F07, B14 · **Desbloquea:** F10, F13

## Contexto

`register.tsx` y `recover.tsx` son **demo** (`setTimeout`, sin red) y `src/store/perfil.ts` es un mock fijo (Carlos Mendoza / Finca El Roble). Sin `GET /v1/auth/me` la app no conoce el **rol real** del usuario: productor, cooperativa y comprador ven lo mismo, y el wizard no puede conocer el `finca_id` del productor.

Mismatch conocido: la pantalla de registro captura "Nombre de tu finca" pero el backend pide `{email, password, nombre, rol?}` (nombre de persona). Hay que decidir y alinear el contrato (ajustar la pantalla o el copy).

## Alcance

- `api.register()` contra `POST /v1/auth/register` con manejo de `409` (email duplicado) y `422`; resolver el mismatch de campos documentado arriba.
- Recover real contra los endpoints de B14 (`recover` + `confirm`).
- `GET /v1/auth/me` tras login/restore: sustituir el mock de `perfil.ts` por datos reales (email ya se guarda en sesión) y exponer `rol` (+ `finca_id`/entidad vinculada si el contrato lo provee) para gating de UI por rol.
- Limpiar comentario desactualizado de `login.tsx` (dice que el backend "se conecta en el módulo siguiente", pero ya está conectado).

## Criterios de aceptación

- [x] Registro real crea cuenta y hace login; recover real cambia la contraseña (flujo demo eliminado).
- [x] El rol real está disponible en un store y la UI puede condicionar por rol (base para F10/F13).
- [x] `pnpm exec tsc --noEmit` + `pnpm exec expo lint` en verde.

## Referencias

- `mobile/app/(auth)/{login,register,recover}.tsx`, `mobile/src/store/{auth,perfil}.ts`
- `Backend` `POST /v1/auth/register`, `GET /v1/auth/me`; `docs/ARCHITECTURE.md` §10

## Dependencias

F07 (capa API), B14 (recover backend).
