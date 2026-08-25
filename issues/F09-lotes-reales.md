# [Mobile] F09 — Lotes reales: lista paginada por cursor + detalle con timeline hash por etapa

> **GitHub:** [#30](https://github.com/FerLpz55/BeanTrust/issues/30) · **Estado:** Todo · **Label:** —
> **Depende de:** F07 · **Desbloquea:** F11

## Contexto

`src/store/lotes.ts` usa 6 `MOCK_LOTES` con ids `'lote-401'` y hashes falsos (`mockHash()`); el dashboard (F01) y trazabilidad (F05) consumen ese mock, y el detalle `lotes/[id].tsx` renderiza el timeline desde datos locales. Los ids y `codigo_publico` mock (`BTR-2024-XXXX`) no son compatibles con los UUID/códigos reales del backend.

## Alcance

- `GET /v1/lotes` paginado por cursor (`Pagina{items,next_cursor}`, `?limit&cursor`) en:
  - Dashboard: métricas (activos, peso, certificados) + lotes recientes reales.
  - Trazabilidad: lista completa con filtros por estado + scroll paginado.
- `GET /v1/lotes/{id}` (`LoteDetalleRead` con `historial: LoteEventoRead[]`) en el detalle: mapear eventos (tipo, `hash_etapa`, `registrado_en`, campos ADR-12) al timeline existente.
- Migrar el store de lotes a datos reales: ids UUID, estados de carga/error/vacío, pull-to-refresh.
- Migrar las listas a **FlashList** (convención del repo: nunca `ScrollView`+`map`; hoy se incumple).
- El widget "Estado del Día" se mantiene decorativo en cliente (ADR-13) — sin endpoint.

## Criterios de aceptación

- [ ] Dashboard, trazabilidad y detalle muestran solo datos del backend (cero mocks de lotes).
- [ ] Paginación por cursor funciona en trazabilidad; timeline renderiza el historial real con hash por etapa.
- [ ] `pnpm exec tsc --noEmit` + `pnpm exec expo lint` en verde.

## Referencias

- `mobile/src/store/lotes.ts`, `app/(app)/(tabs)/{index,trazabilidad}.tsx`, `app/(app)/lotes/[id].tsx`
- `docs/ARCHITECTURE.md` §6 (contrato), §7.4 (rendimiento), ADR-13

## Dependencias

F07 (capa API). Desbloquea F11 (eventos sobre el detalle).
