# BeanTrust · Móvil (Expo)

Aplicación móvil (React Native / Expo Router) para registro de eventos en campo,
verificación de Pasaporte de Café y acceso al panel de comercio justo. Consume la
API de `../Backend` (FastAPI).

## Requisitos

- Node + `pnpm` (el repo usa pnpm, no npm)
- Backend corriendo en local (`Backend/`): `uvicorn app.main:app --reload`

## Ejecutar

```bash
pnpm install
pnpm start            # Expo (QR para Expo Go / emulador)
```

La URL de la API se configura con `EXPO_PUBLIC_API_URL` (`.env`) y por defecto
apunta a `http://192.168.1.109:8000` (ver `src/config.ts`).

## Verificación

```bash
pnpm lint             # ESLint (eslint-config-expo)
pnpm typecheck        # tsc --noEmit (los tipos deben compilar limpio)
```

## Estado del MVP (real, no promesa)

| Módulo | Ruta | Estado |
| --- | --- | --- |
| Login / refresh | `app/(auth)/login.tsx` | **Real** — conectado al backend (`src/api/auth.ts`) |
| Registro | `app/(auth)/register.tsx` | **Demo** — sin conexión real |
| Recuperación | `app/(auth)/recover.tsx` | **Demo** — sin conexión real |
| Dashboard (Estado del Día) | `(app)/(tabs)/index.tsx` | Hecho (widget decorativo, ADR-13) |
| Alta de lote (wizard) | `(app)/lotes/nuevo.tsx` | **Placeholder** |
| Detalle de lote | `(app)/lotes/[id].tsx` | Parcial |
| Verificar QR | `app/verificar/index.tsx` y `[codigo].tsx` | **Stub** — botones sin `onPress`; `[codigo]` ignora el parámetro y usa datos mock |
| Mercado | `(app)/mercado.tsx` y `mercado/[loteId].tsx` | **Stub** — datos mock; sin navegación al detalle |
| Trazabilidad / timeline | `(app)/(tabs)/trazabilidad.tsx` | Parcial — tab con filtros funcional; el detalle `lotes/[id].tsx` es placeholder |
| Ajustes | `(app)/(tabs)/ajustes.tsx` | Parcial |

### Convenciones

- Diseño: sistema de tokens **"Copa de cata"** en `src/theme/tokens.ts`
  (tipografías Fraunces / Work Sans / IBM Plex Mono). Preferir tokens; hay colores
  hardcodeados en pantallas (deuda a limpiar).
- Estado de auth: `src/store/auth.ts` (zustand), tokens en `expo-secure-store`
  (`src/storage/secure.ts`), JWT util en `src/utils/jwt.ts`.
- Sin tests automatizados aún (deuda).
- Antes de tocar APIs de Expo, consultar la documentación versionada
  (https://docs.expo.dev/versions/v54.0.0/).