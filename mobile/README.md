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

La URL de la API se configura con `EXPO_PUBLIC_API_URL` (copia `.env.example`
a `.env`). Por defecto apunta a `http://localhost:8000` (ver `src/config.ts`);
**en dispositivo físico debe ser la IP LAN de tu máquina**, no localhost.

## Verificación

```bash
pnpm lint             # ESLint (eslint-config-expo)
pnpm typecheck        # tsc --noEmit (los tipos deben compilar limpio)
```

## Estado del MVP (real, no promesa)

| Modulo | Ruta | Estado |
| --- | --- | --- |
| Login / refresh | `app/(auth)/login.tsx` | **Real** |
| Registro | `app/(auth)/register.tsx` | **Real** — `POST /v1/auth/register` |
| Recuperacion | `app/(auth)/recover.tsx` | **Real** — recover + confirm (B14) |
| Dashboard | `(app)/(tabs)/index.tsx` | **Real** — metricas desde `GET /v1/lotes` |
| Alta de lote (wizard) | `(app)/lotes/nuevo.tsx` | **Real** — `POST /v1/lotes`, idempotente por `body.id` |
| Detalle de lote | `(app)/lotes/[id].tsx` | **Real** — timeline con `hash_etapa` |
| Verificar QR | `app/verificar/` | **Real** — `expo-camera` + `GET /v1/verificar/{codigo}` |
| Mercado | `(app)/mercado.tsx` y `mercado/[loteId].tsx` | **Real** — saldo y panel 97/3 (B13/B16) |
| Trazabilidad | `(app)/(tabs)/trazabilidad.tsx` | **Real** — filtros + paginacion por cursor |
| Ajustes | `(app)/(tabs)/ajustes.tsx` | **Real** — perfil y fincas del backend |
| Registrar evento | — | **Pendiente** (F11): la capa de API existe, falta la UI |
| Offline / cola de sync | — | **Pendiente** (§7.5, fase posterior) |
| Evidencia fotografica | — | **Pendiente** (ADR-14, con B11) |

### Pruebas

```bash
pnpm test             # vitest: capa de API (fetch mockeado)
pnpm typecheck        # tsc --noEmit
pnpm lint             # ESLint
```

> El dinero de pagos y propinas es **simulado** (`FakeGatewayPagos`): no hay
> pasarela ni blockchain (web3 en pausa, B7).

### Convenciones

- Diseño: sistema de tokens **"Copa de cata"** en `src/theme/tokens.ts`
  (tipografías Fraunces / Work Sans / IBM Plex Mono). Preferir tokens; hay colores
  hardcodeados en pantallas (deuda a limpiar).
- Estado de auth: `src/store/auth.ts` (zustand), tokens en `expo-secure-store`
  (`src/storage/secure.ts`), JWT util en `src/utils/jwt.ts`.
- Sin tests automatizados aún (deuda).
- Antes de tocar APIs de Expo, consultar la documentación versionada
  (https://docs.expo.dev/versions/v54.0.0/).