# CLAUDE.md — Instrucciones para ejecutar el backlog de BeanTrust

Guía para Claude Code al implementar las issues de [`issues/`](./issues/).
Complementa (no reemplaza) la memoria del repo: **`AGENTS.md`**, el diseño en
**`docs/ARCHITECTURE.md`** y el contrato API en **`Backend/README.md`**.
Léealos antes de tocar código; si hay conflicto, ARCHITECTURE manda.

## Cómo trabajar una issue

1. **Elige la issue** respetando el orden y las dependencias de
   [`issues/README.md`](./issues/README.md). No empieces una cuyas
   dependencias estén abiertas.
2. **Lee el archivo de la issue completo** (contexto, alcance, criterios).
   El alcance manda: no agregues features fuera de él.
3. **Cambios mínimos**, siguiendo el estilo del código existente. Nada de
   refactor fuera del alcance ni de tocar tests existentes salvo que la
   interfaz lo exija.
4. **Regla de oro docs↔código** (innegociable): si tocas routers, endpoints
   o reglas de acceso, sincroniza **en el mismo cambio**:
   `Backend/tests/integration/test_contrato_api.py` + tabla de
   `Backend/README.md` + `docs/ARCHITECTURE.md` §6 (y §10 si cambia acceso/rol).
5. **Verificación obligatoria antes de dar por terminada** (si una falla,
   arréglala en el mismo cambio):
   - Backend: `cd Backend && .venv/bin/ruff check app tests && .venv/bin/pytest`
     (NO `ruff format --check` global — ver AGENTS.md).
   - Mobile: `cd mobile && pnpm exec tsc --noEmit && pnpm exec expo lint`.
6. **Al cerrar**: marca los criterios en el archivo de `issues/`, pon su
   estado en `Done`, y refleja el cambio en GitHub (`gh issue edit/close`)
   solo si el usuario lo pide. **No hagas `git commit`/`push` sin que te lo
   pidan explícitamente.**

## Reglas duras del dominio

- **Dinero siempre simulado**: pagos y propinas van por `FakeGatewayPagos`.
  Prohibido integrar dinero real, pasarelas o blockchain (web3 en pausa, B7).
- **La app jamás escribe directo a la base de datos**: todo pasa por la API
  FastAPI. El mercado es proyección read-only (ADR-9); el "Estado del Día" es
  decorativo en cliente (ADR-13, sin endpoint).
- **Idempotencia**: todo `POST` de operación (lotes, eventos, propinas) lleva
  header `Idempotency-Key` (UUID generado en el móvil, reusado en reintentos).
- **Tenancy**: el rol/tenant se resuelve en el backend desde
  `auth.uid()` → `usuarios`, nunca de un id enviado por el cliente ni del
  claim `role` del JWT.

## Backend (FastAPI) — buenas prácticas

- Capas: `endpoints → services → repositories` (interfaz + in_memory +
  supabase). El router no hace lógica; el dominio (`models/dominio.py`) no
  hace I/O.
- Una operación HTTP = una función. `Annotated` + `Depends` para DI. Tipos de
  retorno en path operations. E/S blocking (SDK Supabase) en `def` síncrono.
- Todo router nuevo se monta en `Backend/app/api/v1/router.py` (uno definido
  pero no montado es un bug de contrato).
- Errores de negocio: 422 (validación) / 409 (estado inválido), mensajes en
  español. Nada de claves en código: solo variables de entorno.
- Tests nuevos en `Backend/tests/` (unit/integration) para todo lo que agregues.

## Mobile (Expo) — buenas prácticas

- **Consulta https://docs.expo.dev/versions/v54.0.0/ antes de escribir código
  de Expo** (regla de `mobile/AGENTS.md`).
- Colores/estilos solo desde los tokens "Copa de cata" (`src/theme/tokens.ts`);
  cero hex hardcodeados.
- Listas con **FlashList** (nunca `ScrollView` + `map`); estado atómico con
  selectores de Zustand; imágenes con `expo-image`.
- La URL del backend sale de `EXPO_PUBLIC_API_URL` (`src/config.ts`), nunca
  hardcodeada en pantallas.
- El grupo `verificar/` es **público (sin auth)**: no pedir token ahí.
- Credenciales dev del backend local: `productor@beantrust.dev/Prod123!`,
  `cooperativa@beantrust.dev/Coop123!`, `comprador@beantrust.dev/Comp123!`,
  `admin@beantrust.dev/Admin123!`.
