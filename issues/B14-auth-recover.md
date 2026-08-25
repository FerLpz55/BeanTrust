# [Backend] B14: Endpoint de recuperación de contraseña (POST /v1/auth/recover + confirm)

> **GitHub:** [#27](https://github.com/FerLpz55/BeanTrust/issues/27) · **Estado:** Done · **Label:** `backend`
> **Depende de:** — · **Desbloquea:** F08

## Contexto

El móvil tiene `app/(auth)/recover.tsx` en modo **demo** (`setTimeout`, sin red) y el backend **no tiene endpoint** de recuperación. Decisión de producto: crearlo ahora; el envío de correo real llega con Supabase Auth en B11 (mientras tanto, en modo local el token se expone/loguea para desarrollo).

## Alcance

- `POST /v1/auth/recover`: recibe `email`; si el usuario existe, genera token de recuperación **firmado y con expiración** (one-shot). Respuesta siempre uniforme (no revelar si el email existe).
- `POST /v1/auth/recover/confirm`: recibe `token` + nueva contraseña; valida firma/expiración/un solo uso y actualiza el hash (argon2, `LocalAuthProvider`).
- Rate limit en el endpoint (el limiter actual es en memoria — alcance MVP).
- Contrato ampliado: actualizar **en el mismo cambio** `Backend/tests/integration/test_contrato_api.py`, la tabla de `Backend/README.md` y `docs/ARCHITECTURE.md` §6 (regla de oro docs↔código).
- Dejar documentado que el envío por correo se sustituye por Supabase Auth en B11.

## Criterios de aceptación

- [x] Flujo completo recover→confirm funciona contra el almacén en memoria con tests (expiración, reuso de token, email inexistente).
- [x] `test_contrato_api.py`, README y ARCHITECTURE sincronizados; `ruff check app tests` + `pytest` en verde.

## Referencias

- `Backend/app/api/v1/endpoints/auth.py`, `Backend/app/core/seguridad` (JWT + argon2)
- `docs/ARCHITECTURE.md` §10 (flujo de autenticación)

## Dependencias

Ninguna. Desbloquea F08 (recover real en móvil).
