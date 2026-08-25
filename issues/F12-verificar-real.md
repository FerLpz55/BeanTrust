# [Mobile] F12 — Verificar real: GET /v1/verificar/{codigo} + escáner QR con expo-camera

> **GitHub:** [#33](https://github.com/FerLpz55/BeanTrust/issues/33) · **Estado:** Todo · **Label:** —
> **Depende de:** F07 · **Desbloquea:** —

## Contexto

`src/store/verificar.ts` simula la red (`setTimeout(500)`) sobre una base mock de 2 códigos (`BTR-2024-0042`, `BTR-2024-0128`). El "escáner" de `app/verificar/index.tsx` es un cuadro negro decorativo: `expo-camera` **no está instalado**. El grupo `verificar/` es público (sin auth) y el backend ya expone `GET /v1/verificar/{codigo}` con `200/404/409` (Pasaporte de Café con timeline hash por etapa).

## Alcance

- `api/verificar.ts`: `GET /v1/verificar/{codigo}` **sin token**; mapear `VerificarRead` (variedad, método de beneficiado, altitudes, humedad, SCA, productor, finca, municipio, timeline con `hash_etapa`) al modelo de UI.
- Manejo de estados: `200` → Pasaporte renderizado; `404` → "Código no encontrado"; `409` → alerta de pasaporte manipulado; error de red → reintento.
- Instalar `expo-camera` y reemplazar el visor decorativo por **escaneo real de QR** (con permiso de cámara y fallback a input manual, que se mantiene).
- Eliminar los botones demo y el mock de `verificar.ts`; el donut del pasaporte debe usar el dato real (97/3 del lote) en vez del 97% hardcodeado.
- Consultar https://docs.expo.dev/versions/v54.0.0/ para la API de `expo-camera` antes de implementar (regla del `mobile/AGENTS.md`).

## Criterios de aceptación

- [ ] Escanear un QR real (o escribir un código real) muestra el Pasaporte de Café desde el backend, con 404/409 diferenciados.
- [ ] Cero datos mock en el flujo de verificación.
- [ ] `pnpm exec tsc --noEmit` + `pnpm exec expo lint` en verde.

## Referencias

- `mobile/app/verificar/{index,[codigo]}.tsx`, `mobile/src/store/verificar.ts`
- `docs/ARCHITECTURE.md` §8 (Pasaporte de Café, códigos 200/404/409)

## Dependencias

F07 (capa API).
