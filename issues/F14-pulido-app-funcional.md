# [Mobile] F14 — Pulido app funcional: acciones muertas, Generar QR y colores a tokens Copa de cata

> **GitHub:** [#35](https://github.com/FerLpz55/BeanTrust/issues/35) · **Estado:** Done · **Label:** —
> **Depende de:** F09–F13 · **Desbloquea:** —

> **Estado real:** ya se cablearon el boton del certificado QR, los `onRetry` del banner
> offline y los chips muertos de Mercado. Quedan los `MenuItem` de Ajustes, el color
> hardcodeado de `error-boundary`/`auth-shell` y la sincronizacion forzada.

## Contexto

Con los flujos ya conectados (F07–F13), quedan acciones que **parecen funcionales pero no hacen nada**, y deuda visual fuera del sistema de diseño "Copa de cata":

- **Botones muertos:** "Retirar" e "Historial" en `mercado.tsx` (Views sin `onPress`); los 4 `MenuItem` de `ajustes.tsx` (Notificaciones, Modo oscuro, Idioma, Ayuda) sin `onPress`; "Forzar sincronización" solo hace haptics; `OfflineBanner onRetry={() => {}}` no-op en dashboard y trazabilidad.
- **"Generar Certificado QR"** en `lotes/[id].tsx` es un `console.log`.
- **Colores hardcodeados fuera de tokens:** `#000` (sombras en dashboard y verificar), `#F8EBDC` (mercado), `#4CAF50`/`#F44336` (dot de sync en ajustes), `#ffdad6`/`#93000a` (error-boundary), `#00000000` (auth-shell).
- **Comentarios desactualizados** (p.ej. `login.tsx` afirma que el backend aún no se conecta).

## Alcance

- Cablear u **ocultar** cada acción muerta: lo que no tenga backend aún (p.ej. sync real, que es fase posterior) se oculta o muestra estado honesto; nada de botones que mienten.
- "Generar Certificado QR": si el lote está en `TOSTADO+` y tiene certificado, mostrar el QR del `codigo` real (para que el consumidor lo escanee con `verificar/`); si no, estado deshabilitado explicado.
- Sustituir todos los colores hardcodeados por tokens de `src/theme/tokens.ts`.
- Limpiar comentarios desactualizados.

## Criterios de aceptación

- [x] Cero acciones muertas visibles; cero colores fuera de tokens en las pantallas listadas.
- [x] `pnpm exec tsc --noEmit` + `pnpm exec expo lint` en verde.

## Nota de cierre

De lo que quedaba abierto en "Estado real": los 4 `MenuItem` de `ajustes.tsx`
ahora son reales (Modo oscuro tri-estado persistido con `expo-secure-store`
vía `src/store/tema.ts`; Ayuda y soporte con FAQ + enlace a GitHub Issues,
`src/components/ayuda-modal.tsx`; Notificaciones/Idioma deshabilitados con
estado honesto "Próximamente" — sin `expo-notifications` ni i18n, fingir que
funcionan violaría esta misma issue). "Forzar sincronización" se quitó (no
hacía nada real: la cola offline de §7.5 sigue pendiente). Colores a tokens:
`error-boundary.tsx` ahora usa `errorContainer`/`onErrorContainer`;
`auth-shell.tsx` usa `'transparent'` en vez de `#00000000`.

## Referencias

- `mobile/src/theme/tokens.ts`, `docs/ARCHITECTURE.md` §7.3 (paleta "Copa de cata")

## Dependencias

F09–F13 (para cablear contra datos reales en vez de ocultar).
