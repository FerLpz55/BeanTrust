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

En el piloto Android el `.env` apunta a `https://beantrust-api.vercel.app`
(backend en Vercel sobre Supabase real). El registro público está cerrado: las
cuentas piloto las crea Auth Admin, no la pantalla de registro.

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
| Registrar evento | `src/components/registrar-evento-modal.tsx` | **Real** — `POST /v1/lotes/{id}/eventos` (F11) |
| Offline / cola de sync | `src/offline/` | **Real** — SQLite + NetInfo, cola FIFO, reintento y descarte (§7.5) |
| Evidencia fotografica | `src/evidencia/` | **Real** — cámara/galería → JPEG+SHA-256 persistido → `POST /v1/evidencias` encolado (ADR-14) |

### Evidencia fotográfica (ADR-14)

- Captura con `expo-image-picker` (cámara o galería), normaliza a **JPEG 2048 px
  q0.82** con `expo-image-manipulator` y persiste el archivo **fuera de cache**
  con `expo-file-system`, calculando su **SHA-256**.
- La subida es `multipart/form-data` vía `apiFormData` (nunca fija
  `Content-Type`; React Native construye el boundary): `src/api/evidencias.ts`
  expone `subirEvidencia` y `obtenerUrlEvidencia` (URL firmada ~10 min).
- En la cola offline la foto vive en la tabla `attachments`: el motor sube
  primero `subir_evidencia` y después la operación de cosecha, conserva el
  archivo hasta que el lote lo referencia y lo borra al confirmar. Descartar la
  operación arrastra la pareja lote+foto.

### Rendimiento

Las listas largas (trazabilidad, timeline del detalle de lote, mercado y
propinas del lote) usan **FlashList** en lugar de `ScrollView` + `map`.

### Prueba Android sin conexión

1. Configura `EXPO_PUBLIC_API_URL` con la IP LAN de tu máquina y arranca
   `pnpm start` + el backend local.
2. Inicia sesión con una cuenta de demo y registra un lote con foto.
3. Activa **modo avión** en el dispositivo Android y registra otra cosecha con
   evidencia: la app la muestra como `pendiente: true` (proyección optimista).
4. En **Ajustes → pendientes** verifica que aparezcan las operaciones en cola
   (`subir_evidencia` + cosecha).
5. Desactiva el modo avión y deja que la app sincronice (o fuerza el flush):
   las pendientes se resuelven y, si algo falla, queda como conflicto para
   descartar o reintentar.

### Permisos

`app.json` declara los permisos vía plugins: `expo-camera` (escáner del
Pasaporte de Café) y `expo-image-picker` (cámara + fotos para la evidencia de
cosecha; micrófono desactivado).

### Pruebas

```bash
pnpm test             # vitest: API, offline/cola y evidencia (mocks nativos)
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
- Antes de tocar APIs de Expo, consultar la documentación versionada
  (https://docs.expo.dev/versions/v54.0.0/).