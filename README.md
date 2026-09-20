# BeanTrust

*English translation: [`README.en.md`](./README.en.md).*

Ecosistema Integral para la trazabilidad y comercio justo en la cadena de suministro del café mediante API y blockchain.

Este proyecto busca mitigar la intermediación excesiva en zonas rurales mediante la asignación de una identidad digital al grano de café. El sistema registra de forma inmutable los eventos clave de la cadena (cosecha, limpieza, despulpado, fermentación, lavado, secado, reposo, descascarado, clasificación, tostado y venta) para certificar el origen del producto, facilitar el acceso a mercados de especialidad y permitir propinas directas del comprador al productor.

## Estructura del Proyecto

Este repositorio centraliza los componentes del ecosistema Bean Trust:

* `Backend/`: Backend (FastAPI). Maneja la lógica de negocio central, la base de datos relacional (Supabase/PostgreSQL, migraciones en `Backend/db/`) y la exposición de endpoints.
* `mobile/`: Aplicación móvil (React Native / Expo). Interfaz de usuario diseñada para registro de eventos en campo con soporte *offline*.
* `docs/`: Documentación técnica (la arquitectura es la fuente de verdad del diseño).
* `.opencode/`: Configuración de agentes; `AGENTS.md` guarda la memoria persistente del proyecto y las reglas de alineación docs↔código.

> **Nota:** `contracts/` (Foundry, Solidity) contiene `CoffeeTraceability.sol`,
> desplegado y activo en Base Sepolia (anclaje del Pasaporte, ADR-11); los pagos y
> propinas siguen simulados (`FakeGatewayPagos`). `db/` en la raíz no existe: la
> BD vive en `Backend/db/`. La estructura real está descrita en
> `docs/ARCHITECTURE.md` §3.

## Documentación

* [Arquitectura](docs/ARCHITECTURE.md) — qué hace cada pieza, por qué está diseñada así y cómo se relaciona entre sí.

## Stack Tecnológico

* **Backend:** Python ≥3.12 (FastAPI, Pydantic)
* **Base de Datos:** Supabase / PostgreSQL
* **Frontend:** React Native / Expo Router
* **Blockchain:** Base Sepolia (anclaje on-chain real del Pasaporte con `CoffeeTraceability`); pagos y propinas **simulados** por un gateway fake
* **Entorno de Despliegue:** Vercel (API) + Supabase (BD/Auth)

## Características del Sistema

* **Trazabilidad por Estados:** Registro de las transiciones físicas del café (CEREZA → PERGAMINO → ORO → TOSTADO → VENDIDO) con sub-etapas (limpieza, fermentación, lavado, secado, reposo, clasificación).
* **Operación Offline-First (Móvil):** Arquitectura de almacenamiento local y sincronización diferida para mitigar la falta de conectividad en zonas rurales.
* **Pasaporte de Café:** Generación de códigos QR vinculados a la historia del lote para validación criptográfica por parte del consumidor final, con datos enriquecidos (variedad, método, humedad, puntaje SCA).
* **Comercio Justo:** Panel 97/3 (97% al productor, 3% operación) + propinas directas del comprador al productor.

## Estado del MVP (honesto)

- El backend corre sobre Supabase/PostgreSQL en producción (piloto Android cerrado);
  el **alta pública está deshabilitada** y las cuentas piloto se crean por Auth Admin.
- La app móvil cubre login/recuperación, fincas, alta de lote, registro de eventos
  (F11), trazabilidad, Pasaporte de Café con QR verificable y panel de comercio justo.
- **Modo campo offline-first:** caché local en SQLite, cola de sincronización
  FIFO con reintento/descarte y sincronización al recuperar red (`src/offline/`).
- **Evidencia fotográfica (ADR-14):** cámara/galería → JPEG normalizado + SHA-256,
  subida al bucket **privado** `evidencias-lotes` vía `POST /v1/evidencias` y
  encolada offline junto a la cosecha; lectura por URL firmada temporal.
- **Rendimiento:** listas largas virtualizadas con FlashList.
- **Seguridad (B11 avanza):** RLS efectiva por usuario (JWT por request), rate
  limit compartido en Postgres y refresh rotativo en el proveedor local.
- **Blockchain (ADR-11):** anclaje real del Pasaporte en Base Sepolia
  (`CoffeeTraceability`, producción con `BEAN_WEB3_MODE=anchor` y 9 anclas
  `CONFIRMADA`); los **pagos y propinas siguen simulados** con un gateway fake y
  no se mueve dinero real.
- **Pendiente:** verificación del contrato en BaseScan y wallet `public_address`
  del productor (pagos on-chain, fase posterior).
- Verificación operativa del flujo: `Backend/scripts/smoke_production.py`.
