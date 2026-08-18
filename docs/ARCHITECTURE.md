# Arquitectura de Bean Trust

> **English translation:** [`ARCHITECTURE.en.md`](./ARCHITECTURE.en.md).

> Documento de referencia para desarrollo autónomo del equipo.
> Objetivo: que cualquier integrante entienda **qué hace cada pieza** y **por qué está diseñada así**, antes de escribir código.

---

## 1. ¿Qué es Bean Trust? (Resumen de 30 segundos)

Bean Trust es una **plataforma blockchain para la trazabilidad y comercio justo del café veracruzano**.

Resuelve dos problemas de la memoria técnica:

1. **Coyotaje / intermediación excesiva**: un intermediario absorbe hasta el 70% del valor del café.
2. **Falta de certificación confiable**: las certificaciones en papel son lentas, costosas y falsificables.

El sistema da al grano de café una **identidad digital** mediante tecnología blockchain:

- Registra eventos clave de la cadena (cosecha, beneficio, tostado) de forma **inmutable**.
- Emite un **Certificado de Origen**: un **Código QR** único que el consumidor escanea para verificar el origen orgánico certificado (productor, finca, altitud, historia de procesos).
- Ejecuta **pagos justos y automáticos** al productor mediante **Smart Contracts**.

Modelo de negocio (B2B2C): el productor **no paga**. Pagan las cooperativas (suscripción) y los compradores de especialidad (3% de comisión transaccional ejecutada por el Smart Contract). El consumidor final solo escanea el QR; su demanda de transparencia es lo que le da valor a toda la cadena.

---

## 2. Visión general de la arquitectura

```
┌─────────────────────┐      ┌───────────────────────────┐
│      Mobile App     │      │    Red Polygon (L2)        │
│ (React Native/Expo) │      │   ┌────────────────────┐  │
│                     │      │   │ Smart Contract     │  │
│ ┌───────────────┐   │      │   │ CoffeePayments.sol │  │
│ │ SQLite local  │   │      │   └─────────┬──────────┘  │
│ │(offline queue)│   │      │             │ web3         │
│ └───────┬───────┘   │      └─────────────┼─────────────┘
└─────────┼───────────┘                    │
          │ HTTP/JSON (API)                │
┌─────────┼────────────────────────────────┼───────────┐
│ Backend ▼                                ▼           │
│ ┌─────────────────────────┐  ┌─────────────────────┐ │
│ │ API contrato            │  │ Módulo Web3        │ │
│ │ (FastAPI)               │  │ (web3.py / scripts)│ │
│ │ - Reglas de negocio     │  │ - Firmado          │ │
│ │ - QR públicos           │  │ - Deploy testnet  │ │
│ │ - Sincronización offline│  │                     │ │
│ └───────────┬─────────────┘  └─────────────────────┘ │
│             │ SQL                                      │
│             ▼                                          │
│   ┌─────────────────────┐                              │
│   │ Supabase            │                              │
│   │ (PostgreSQL + Auth) │                              │
│   │ + RLS + Storage     │                              │
│   └─────────────────────┘                              │
└────────────────────────────────────────────────────────┘
```

### Separación de responsabilidades (decisión modular)

- **FastAPI** es la única puerta que valida las reglas de negocio y la única que conoce la máquina de estados del café. **La app jamás escribe directo en la base de datos**.
- **Supabase** es la fuente de verdad relacional (PostgreSQL) + Auth + Row Level Security (RLS) + Storage de QR (Backend-as-a-Service).
- **Smart Contracts (Polygon)**: solo contienen el *flujo de dinero*, nunca la lógica de negocio completa.

| Componente | Rol | Quién lo consume |
|---|---|---|
| **Mobile App** | Registro en campo, QR, paneles básicos | Productores, cooperativas |
| **FastAPI** | API contrato, orquestación, reglas de estado, sync, web3 | Mobile, QR público |
| **Supabase** | Persistencia relacional, Auth, RLS, Storage | FastAPI, paneles web |
| **Smart Contracts** | Pago justo automático, inmutabilidad on-chain | Backend, cooperativas |
| **Docs / ADR** | Decisiones, diagramas, reglas de negocio | Todo el equipo |

---

## 3. Estructura de carpetas (monorepo)

```
BeanTrust/
├── docs/
│   ├── ARCHITECTURE.md        # ← Este documento
│   ├── 01-dominio-cafe.md      # Máquina de estados (Issue 1)
│   ├── 02-modelo-datos.md      # ERD + migraciones (Issue 2)
│   ├── 03-api-contrato.md      # Endpoints + schemas (Issue 3)
│   ├── 04-ui-flujo.md          # Wireframes + navegación (Issue 4)
│   ├── 05-offline-sync.md      # Sincronización offline (Issue 5)
│   └── adr/                    # Decisiones de arquitectura (ADR)
├── Backend/                     # FastAPI
│   ├── app/
│   │   ├── main.py              # Punto de inicio: instancia FastAPI(), monta routers
│   │   ├── core/                 # config, seguridad (JWT Supabase), logger
│   │   ├── api/v1/
│   │   │   └── endpoints/        # lotes, eventos, verificacion, pagos, auth, sync (1 router por dominio)
│   │   ├── models/                # Esquema de datos (SQLAlchemy / Supabase)
│   │   ├── schemas/               # Pydantic → validación entrada/salida
│   │   ├── services/              # maquina_estados, qr_service, blockchain_link
│   │   ├── repositories/          # RepositorioLote (interfaz) + SupabaseLoteRepo (impl.) — ver §4
│   │   ├── utils/                 # helpers puros sin estado (hashing, formateo, etc.)
│   │   └── dependencies.py        # Inyección de dependencias compartidas (DB, Auth) — ver §4
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   └── pyproject.toml
├── mobile/                     # React Native (Expo Router)
│   ├── app/                    # Pantallas (registro, lote, QR, sync...)
│   ├── src/
│   │   ├── components/         # Componentes UI reutilizables
│   │   ├── api/                # Cliente HTTP (por módulo)
│   │   ├── db/                 # SQLite local (expo-sqlite / WatermelonDB)
│   │   └── supabase/           # Cliente de Supabase (Auth, lecturas)
│   └── sync/                   # Cola de operaciones offline
├── contracts/                  # Solidity (Foundry)
│   ├── src/CoffeePayments.sol  # ← Contrato principal
│   ├── src/interfaces/
│   ├── test/                   # Pruebas de los contratos
│   └── script/                 # Despliegue a Polygon (testnet/mainnet)
├── db/                         # Migraciones SQL + seed
└── README.md
```

---

## 4. Modelo de dominio: el viaje del grano

> Regla de oro: el **lote** es la entidad base (aggregate / núcleo del modelo) y pasa por **estados** discretos. La **historia** de un lote es una lista de **eventos inmutables** que **no se reescribe nunca** (append-only).

### Estados del café

```mermaid
stateDiagram-v2
    direction TB

    [*] --> CEREZA
    CEREZA --> PERGAMINO : despulpado + secado\n(merma de peso)
    PERGAMINO --> ORO : limpieza + descascarado\n(kg oro)
    ORO --> TOSTADO : tostado\n(habilita QR)
    TOSTADO --> VENDIDO : VENTA_REGISTRADA\n(dispara pago on-chain)
    CEREZA --> [*] : rechazo
    PERGAMINO --> [*] : rechazo
    ORO --> [*] : rechazo
    VENDIDO --> [*]

    note right of CEREZA
       Registro inicial de cosecha:
       - Productor, finca
       - Altitud
       - Peso (kg)
       - Fecha de cosecha
       - Genera CÓDIGO ÚNICO del lote
    end note
    note right of VENDIDO
       Al registrar la venta, el backend
       firma y ejecuta el Smart Contract
       que paga el 97% al productor y
       retiene la comisión (3%).
    end note
```

### Reglas de negocio de transición (resumen)

| Transición | Acción obligatoria | Campos que se verifican |
|---|---|---|
| `CEREZA → PERGAMINO` | Despulpado + secado | `merma_pct`, `peso_kg`, `actor_id` |
| `PERGAMINO → ORO` | Limpieza + descascarado | `peso_kg`, `merma_pct` |
| `ORO → TOSTADO` | Tostado en planta | fecha de tostado (`registrado_en`) |
| `TOSTADO → VENDIDO` | Registro de precio/venta | `monto_total`, `comprador_id`, `tx_hash` |

**Invariantes de negocio (prohibiciones)**:
- No se puede avanzar dos estados de golpe (`CEREZA → ORO` = error).
- No hay retroceso después de `TOSTADO` (irreversible físicamente).
- La merma nunca puede ser negativa.
- Cada evento registra quién lo hizo (`actor_id`) y un `timestamp` con zona horaria (UTC).

### Diseño orientado a objetos (OOP) — el corazón del dominio

> **¿Por qué OOP?** El problema de Bean Trust es un **modelado de dominio rico**: el Lote no es un simple registro, es un objeto que **tiene un ciclo de vida**, **valida sus propias transiciones** y **emite su certificado y su pago**. Modelarlo con objetos nos permite que esas reglas vivan **junto a los datos** (encapsulamiento) y no dispersas en scripts.

Qué beneficios concretos logramos con OOP aquí (basado en la skill de Python + patrón de dominio DDD):

1. **Encapsulación**: el `Lote` conoce su historia y *no se deja engañar* de pasar de CEREZA a ORO directo. Quien lo invoca simplemente pide "avanzar", el objeto valida o lanza error.
2. **Inmutabilidad de eventos**: `LoteEvento` es un **value object inmutable**: se crea y nunca se modifica. Esto es lo que hace verificable la trazabilidad (mismo principio que el append-only en BD).
3. **Polimorfismo controlado** para los estados: cada estado (`CerezaState`, `PergaminoState`, …) puede tener su propia lógica de validación de salida. Se gestiona con la **StateMachine** (patrón *State*), no con `if/case` gigantes en la API.
4. **Inversión de dependencias (DI)**: el servicio de aplicación depende de **interfaces** (`RepositorioLote`, `GatewayPagos`), no de Supabase ni de Polygon directamente → cambios de infraestructura no tocan la lógica.

**Buenas prácticas OOP de la skill Python aplicadas a este dominio:**

| Skill (buena práctica) | Cómo se aplica en Bean Trust |
|---|---|
| **Pydantic para las fronteras (schemas)** | El `Lote` de dominio es una clase normal (o `@dataclass`); los `LoteCreate`/`EventoCreate` con Pydantic validan **en el router** la entrada/salida. No se mezcla validación de transporte con lógica de negocio. |
| **Value object inmutable (`frozen=True`)** | `LoteEvento` se define `@dataclass(frozen=True)`: se crea, se lee, jamás se modifica → la historia no puede ser alterada ni reordenada. (Gotcha de la skill: `dataclass` para structs internos, Pydantic solo en las fronteras API.) |
| **`Enum` en vez de strings mágicos** | `Estado` y `TipoEvento` son `enum.Enum` de Python: el compilador/linter atrapa typos y solo permite valores válidos en `MaquinaEstados`. |
| **Cuidado con `bool` como subclase de `int`** | Al validar `esTransicionValida(...)` nunca se compara con `== True`, se usa `is` o se tipa `bool` explícitamente en la firma (gotcha de la skill). |
| **`Depends` de FastAPI para DI** | Los repositorios/gateways (`SupabaseLoteRepo`, `GatewayPagos`) se inyectan con `Annotated` + `Depends` (skill de FastAPI). El dominio habla solo contra interfaces → testeable con mocks. |
| **Sin `dicts` desnudos** | Todo lo que cruza la frontera va en modelos Pydantic tipados; el dominio nunca recibe `dict.get("x")` que puede fallar en silencio (gotcha de la skill). |

**Diagrama de clases (OOP):**

```mermaid
classDiagram
    class Lote {
        <<aggregate root>>
        -UUID id
        -UUID finca_id
        -String codigo_publico
        -Estado estado
        -float peso_actual_kg
        -Date fecha_cosecha
        +registrar(EventoCosecha) LoteEvento
        +avanzar(tipo: TipoEvento) LoteEvento
        +generarCertificado() CertificadoQR
        +asociarVenta(venta: Venta) Pago
        +esTransicionValida(a: Estado) bool
    }

    class LoteEvento {
        <<value object inmutable>>
        -UUID id
        -UUID lote_id
        -Estado de_estado
        -Estado a_estado
        -float merma_pct
        -float peso_kg
        -UUID actor_id
        -Instant registrado_en
    }

    class CertificadoQR {
        <<entidad>>
        -UUID id
        -UUID lote_id
        -String codigo
        -String hash_sha256
        -Instant emitido_en
        +verificarEntrada(codigo: String) bool
    }

    class Pago {
        <<entidad>>
        -UUID id
        -UUID lote_id
        -float monto_total
        -float comision_pct
        -float monto_productor
        -String tx_hash
        -EstadoPago estado_pago
        +confirmar() void
    }

    class Finca {
        <<entidad>>
        -UUID id
        -UUID productor_id
        -UUID cooperativa_id
        -String nombre
        -String municipio
        -float altitud_min
        -float altitud_max
        -bool organica
    }

    class Productor {
        <<entidad>>
        -UUID id
        -String nombre
        -List Fincas
    }

    class MaquinaEstados {
        <<service>>
        -Map transiciones
        +permitida(de: Estado, a: Estado): boolean
    }

    class RepositorioLote {
        <<interface>>
        +buscarPorId(UUID) Lote
        +guardar(Lote)
        +adjuntarEvento(LoteEvento)
    }

    class SupabaseLoteRepo {
        +buscarPorId(UUID) Lote
        +guardar(Lote)
        +adjuntarEvento(LoteEvento)
    }

    class LoteService {
        +registrarCosecha(lote, evento) LoteEvento
        +avanzarEstado(id, tipo) LoteEvento
        +generarCertificado(id) CertificadoQR
        +pagar(lote, venta) Pago
    }

    class GatewayPagos {
        <<interface>>
        +emitirPago(venta: Venta) String  // tx_hash
    }

    RepositorioLote <|.. SupabaseLoteRepo
    Lote "1" --> "0..*" LoteEvento : registra
    Lote "1" --> "0..1" CertificadoQR : emite
    Lote "1" --> "0..1" Pago : liquida
    Lote "0..*" --> "1" Finca : pertenece
    Finca "0..*" --> "1" Productor : dueño
    Lote --> MaquinaEstados : valida
    LoteService ..> RepositorioLote : usa
    LoteService ..> GatewayPagos : usa
```

> **Nota de implementación:** este diagrama es **conceptual** (CamelCase). En el código los nombres son snake_case (`LoteService` = `LoteService`, `RepositorioLote` = `lote_repo`, `QrService` = `qr_service`), los repos son protocolos en `app/repositories/` y la entidad `Productor` es la columna `rol`/FK de `Usuario` (véase la nota del ERD en §5).

**Por qué cada elemento:**

| Clase | Por qué existe | Principio OOP |
|---|---|---|
| `Lote` (aggregate) | Única identidad raíz que garantiza consistencia de datos | Aggregate + Encapsulación |
| `LoteEvento` | La historia es **inmutable**: es la evidencia de trazabilidad | Inmutabilidad / Value Object |
| `Estado` (enum + clases State) | Máquina de estados encapsulada; evita transiciones ilegales | Patrón State |
| `MaquinaEstados` | Define la tabla de transiciones como **declarativa** (un mapa, no if/case) | OCP (abierto a extensión) |
| `RepositorioLote` (interfaz) | El dominio no depende de la BD (Supabase es un detalle) | Dependency Inversion |
| `GatewayPagos` (interfaz) | El dominio no sabe cómo se paga (Polygon es un detalle) | Dependency Inversion |
| `Finca`, `Productor` | Entidades de contexto on-farm que el Certificado de Origen debe exhibir | Bounded Context (origen) |
| Services | Separación: los rout​ers no hacen lógica; los services deciden el "qué" | Single Responsibility |

> **`EventoCosecha` y `Venta` no son entidades de dominio**: son **schemas Pydantic** (DTOs de entrada) que cruzan la frontera de la API; el dominio los recibe, los valida y los convierte en `LoteEvento` / `Pago`. No tienen tabla propia.

> Esta estructura OOP se traduce, en FastAPI, a módulos del skill (services, schemas, repositories) y en la BD a las tablas de §5. **No es una sobre-ingeniería**: son 5–6 clases de dominio que dan integridad al problema central (no dar falsos certificados).

---

## 5. Modelo de base de datos (PostgreSQL / Supabase)

### Principio central: Estado actual + historial inmutable

- **`lotes`**: una fila con el **estado actual** (denormalizado) → lecturas rápidas de panel y QR.
- **`lote_eventos`**: **append-only**, almacena cada transición como un evento inmutable → evidencia de trazabilidad.

Este patrón de *event-sourcing ligero* es lo que permite probar la certificación: la historia nunca se edita.

### Diagrama Entidad-Relación (ERD)

```mermaid
erDiagram
    USUARIOS ||--o| PRODUCTOR : "es un (1-1)"
    USUARIOS ||--o| COOPERATIVA : "es una (1-1)"
    USUARIOS ||--o| COMPRADOR : "es un (1-1)"
    PRODUCTOR ||--o{ FINCA : "posee (1-N)"
    PRODUCTOR }o--o{ COOPERATIVA : "afiliado (N-M)"
    COOPERATIVA ||--o{ COMPRADOR : "vende_a (1-N)"
    FINCA ||--o{ LOTE : "produce (1-N)"
    LOTE ||--o{ LOTE_EVENTOS : "historia (1-N)"
    LOTE |o--o| QR_CERTIFICADO : "emite (0-1)"
    QR_CERTIFICADO ||--o{ VERIFICACION : "escaneos (1-N)"
    LOTE |o--o| PAGO : "liquida (0-1)"

    USUARIOS {
        uuid id PK
        text email
        text public_address
        enum rol "productor|cooperativa|comprador|admin"
        timestamptz creado_en
    }
    PRODUCTOR {
        uuid id PK
        uuid usuario_id FK
        text nombre
        text telefono
        text municipio
    }
    FINCA {
        uuid id PK
        uuid productor_id FK
        uuid cooperativa_id FK
        text nombre
        text municipio
        real altitud_min
        real altitud_max
        boolean organica
        point ubicacion
    }
    COOPERATIVA {
        uuid id PK
        uuid usuario_id FK
        text nombre
        text rfc
        text contacto
    }
    COMPRADOR {
        uuid id PK
        uuid usuario_id FK
        uuid cooperativa_id FK
        text nombre
        text contacto
    }
    PRODUCTOR_COOPERATIVA {
        uuid productor_id FK
        uuid cooperativa_id FK
        date afiliado_desde
    }
    LOTE {
        uuid id PK
        uuid finca_id FK
        text codigo_publico
        enum estado "CEREZA|PERGAMINO|ORO|TOSTADO|VENDIDO|RECHAZADO"
        real peso_actual_kg
        date fecha_cosecha
    }
    LOTE_EVENTOS {
        uuid id PK
        uuid lote_id FK
        uuid actor_id FK "USUARIOS"
        uuid comprador_id FK "solo en VENTA"
        enum tipo "COSECHA|DESPULPADO|DESCASCARADO|TOSTADO|VENTA|RECHAZADO"
        enum de_estado
        enum a_estado
        real peso_kg
        real merma_pct
        timestamptz registrado_en
    }
    QR_CERTIFICADO {
        uuid id PK
        uuid lote_id FK "unique"
        text codigo
        text hash_sha256
        timestamptz emitido_en
    }
    VERIFICACION {
        uuid id PK
        uuid qr_id FK
        timestamptz fecha
        text dispositivo
    }
    PAGO {
        uuid id PK
        uuid lote_id FK
        uuid cooperativa_id FK
        real monto_total
        real comision_pct
        real monto_productor
        enum estado_pago "PENDIENTE|CONFIRMADO|FALLIDO"
        text tx_hash
    }
```

> **Desviaciones implementadas en el v1 MVP (vs. ERD completo):**
> - No existen tablas `PRODUCTOR`, `COOPERATIVA`, `COMPRADOR` ni `PRODUCTOR_COOPERATIVA` como tablas propias. El rol y la entidad vinculada viven en `USUARIOS` (columna `rol` + FK `finca_id`/`cooperativa_id`/`comprador_id`); `FINCA.productor_id` referencia directamente `USUARIOS`. Se simplifica el modelo para el MVP y se documenta la migración futura (B7/B11).
> - `USUARIOS.public_address` (wallet) **no se persiste aún**: depende del milestone de contratos (B11) y de la integración web3 (pausada).
> - `VERIFICACION` usa `lote_id` + `verificado_en` en vez de `qr_id` + `fecha`: un QR certifica un lote 1-1, por lo que el escaneo se ancla al lote directamente.
> - `LOTE.codigo_publico` no existe como columna: el código público de verificación vive en `QR_CERTIFICADO.codigo`.
> - Las PK UUID se generan en el cliente (offline-first), no con `gen_random_uuid()`.
> - El índice real es `idx_lote_eventos_lote` (véase `001_esquema_inicial.sql`).

### Diagrama Entidad-Relación conceptual (notación Chen)

> Versión **didáctica** del modelo (como la del ejemplo de referencia): destaca *entidades* (rectángulo), *relaciones* (rombo) y *cardinalidades* (1:1, 1:N, N:M) **sin** detallar columnas. Su objetivo es validar la lógica de negocio (¿quién se relaciona con quién y cuántos?) antes de aterrizar en el modelo físico de la § anterior.

```mermaid
flowchart LR
    USR[USUARIO]
    PROD[PRODUCTOR]
    COOP[COOPERATIVA]
    COMPR[COMPRADOR]
    FINC[FINCA]
    LOTE[LOTE]
    EVN[LOTE_EVENTOS]
    QR[QR_CERTIFICADO]
    VER[VERIFICACION]
    PAG[PAGO]

    R1{{POSEE 1:N}}
    R2{{AFILIADO N:M}}
    R3{{VENDELA 1:N}}
    R4{{PRODUCE 1:N}}
    R5{{GENERA 1:N}}
    R6{{EMITE 1:1}}
    R7{{RECIBE 1:N}}
    R8{{LIQUIDA 1:1}}

    USR ---|1:1| PROD
    USR ---|1:1| COOP
    USR ---|1:1| COMPR
    PROD --- R1 --- FINC
    PROD --- R2 --- COOP
    COOP --- R3 --- COMPR
    FINC --- R4 --- LOTE
    LOTE --- R5 --- EVN
    LOTE --- R6 --- QR
    QR --- R7 --- VER
    LOTE --- R8 --- PAG
```

> **Lectura del modelo conceptual:**
> - `USUARIO → PRODUCTOR/COOPERATIVA/COMPRADOR` son relaciones **1:1**: una cuenta del sistema es exactamente una de esas tres figuras (rol vive en la tabla `USUARIOS.rol`).
> - `PRODUCTOR` **posee** muchas `FINCA`s (1:N); cada finca pertenece a un solo productor.
> - Una `COOPERATIVA` **vende** su café a varios `COMPRADOR`es (**1:N**); el `COMPRADOR` lleva `cooperativa_id` como FK.
> - `PRODUCTOR` está **afiliado** a varias `COOPERATIVA`s y viceversa (**N:M**) → se materializa con la tabla puente `PRODUCTOR_COOPERATIVA`.
> - `FINCA` **produce** muchos `LOTE`s y cada lote **genera** muchos `LOTE_EVENTOS` (1:N).
> - Cada `LOTE` **emite como mucho un** `QR_CERTIFICADO` y **liquida como mucho un** `PAGO` (1:1 "baja": 0 o 1) — coincide con el ERD.
> - `LOTE_EVENTOS`, `QR_CERTIFICADO`, `VERIFICACION` y `PAGO` son **entidades débiles**: solo tienen sentido ligadas a su lote/origen.

> **De lo conceptual a lo físico (`erDiagram` de arriba):** las relaciones 1:1/1:N se resuelven con una **FK** en la entidad del lado "N"; las N:M requieren una **tabla intermedia** (`PRODUCTOR_COOPERATIVA`). Los diseños por Issue 1–5 se consolidaron en este documento y en `docs/06-contratos.md`.

### Diagrama de flujo de datos (DFD) — de dónde viene cada dato

> El ERD muestra *qué* hay; este diagrama muestra *de dónde viaja cada dato* hasta la base y *quién lo consume*. Antes de guardar datos hay que saber quién los crea y quién los usa.

```mermaid
flowchart LR
    subgraph Fuentes["⚙️ Fuentes de datos"]
        A1[Productor en finca] -->|peso, fecha, altitud| A
        A2[Beneficio seco] -->|merma, kg oro| A
        A3[Tostador] -->|tostado, lote| A
    end

    subgraph Almacen [🗄️ Capa de datos]
        A[API FastAPI]
        A --> LOT[LOTES]
        A --> EVEN[LOTE_EVENTOS]
        A --> QR[QR_CERTIFICADO]
        A --> PAG[PAGOS]
    end

    subgraph Consumidor [🔎 Consumidores]
        B1[Cooperativa - panel] --> LOT
        B2[Consumidor - escanea QR] --> QR
        B3[Polygon - confirma pago] --> PAG
    end

    style A fill:#bbdefb
```

### Diagrama de dominio (Clase) — de quién es responsable de cada dato

> El **diagrama de clases del dominio** es el de §4 (única fuente de verdad). Esta sección solo indica cómo se traduce a las tablas de la base de datos.

| Clase (dominio §4) | Tabla(s) | Mapeo |
|---|---|---|
| `Lote` | `LOTE` | 1 fila = 1 lote (estado denormalizado) |
| `LoteEvento` | `LOTE_EVENTOS` | 1 evento = 1 transición (append-only) |
| `CertificadoQR` | `QR_CERTIFICADO` | emitido al llegar a `TOSTADO` (0–1 por lote) |
| `Pago` | `PAGO` | creado al vender (0–1 por lote) |
| `Finca` / `Productor` | `FINCA` / `PRODUCTOR` | contexto de origen del lote |
| `SupabaseLoteRepo` | infraestructura | lee/escribe las tablas anteriores |
| `LoteService`, `MaquinaEstados` | servicios (no tablas) | reglas de negocio |

> Reglas de cardinalidad alineadas entre §4 y este ERD: un lote **tiene como mucho un** QR y **un** pago, porque la certificación (`TOSTADO`) y la venta (`VENDIDO`) solo ocurren una vez terminalmente.

### ¿Por qué se guarda cada dato? (Pregunta de negocio → Dato)

> No guardamos nada "porque sí". Cada dato responde a una pregunta concreta de negocio o a una exigencia regulatoria de la memoria.

| Pregunta de negocio | Dato que guardamos | Tabla |
|---|---|---|
| ¿Quién cultivo este lote? | `productores.*`, `fincas.*` | PRODUCTOR / FINCA |
| ¿Dónde creció? (certificar origen) | `municipio`, `altitud_min/max`, `organica` | FINCA |
| ¿Cuánto café se registró? | `fecha_cosecha`, `peso_kg` | LOTE |
| ¿En qué etapa está? | `estado` → `LOTE` (denorm) | LOTE |
| ¿Cómo fue su historia? (trazabilidad) | `LOTE_EVENTOS` record con de/a estado | LOTE_EVENTOS |
| ¿Se perdió peso en cada proceso? | `merma_pct` | LOTE_EVENTOS |
| ¿Toda la información es inmutable? | `registrado_en` + solo INSERT | LOTE_EVENTOS |
| ¿Quién hizo cada transición? | `actor_id` → `USUARIOS` | LOTE_EVENTOS / USUARIOS |
| ¿Quién escaneó el QR? | `VERIFICACION` (fecha, dispositivo) | VERIFICACION |
| ¿Cuánto paga al productor? | `monto_total`, `monto_productor`, `comision_pct` | PAGO |
| ¿Quién compró el lote? | `comprador_id` en el evento `VENTA` | LOTE_EVENTOS |
| ¿El pago llegó on-chain? | `tx_hash`, `estado_pago` | PAGO |
| ¿Es una persona/org con credenciales? | `email`, `rol`, `public_address` (wallet) | USUARIOS (wallet pendiente, B11) |
| ¿El QR es auténtico? | `hash_sha256` | QR_CERTIFICADO |

---

### Buenas prácticas PostgreSQL (aplicadas desde el inicio)

- **ENUM** para `estado` y `tipo` (no VARCHAR suelto) → evita estados inválidos en BD.
- **`TIMESTAMPTZ`** en todas las fechas (UTC): nunca `TIMESTAMP` sin zona.
- **CHECK constraints**: `merma_pct >= 0`, `peso_kg > 0`, `comision_pct BETWEEN 0 AND 100` → la integridad se valida también en la base, no solo en la API.
- **UUID** como PK (generado en cliente) → admite ids generados offline sin colisiones; el servidor nunca asume que el id llega "vacío".
- **`lote_eventos` inmutable**: sin UPDATE/DELETE, solo INSERT.
- Índice para consultar la historia en orden:
  `CREATE INDEX idx_lote_eventos_lote ON lote_eventos (lote_id, registrado_en DESC);`
- **RLS**: las políticas se anclan a `auth.uid()` → `USUARIOS` (rol + entidad vinculada), nunca a un ID enviado por el cliente.

---

## 6. API contrato (FastAPI) — detalle por endpoint

> El backend es la única puerta que conoce las **reglas de negocio del café**: valida la máquina de estados, genera QR y despacha los pagos. La app solo le pide y le entrega datos; **nunca** escribe directo a la base.

### Capas del backend (lógica de responsabilidades)

```
┌───────────────────────────────────────────────────────────┐
│ 1. Capa de presentación (routers)                          │
│    - Expone los endpoints REST (/lotes, /eventos, ...)     │
│    - Recibe el request y entrega la respuesta como DTO   │
│    - No sabe cómo se procesa un evento                   │
├───────────────────────────────────────────────────────────┤
│ 2. Capa de aplicación (servicios de orquestación)          │
│    "Servicios": decide QUÉ hacer                          │
│    - maquina_estados: ¿es válida esta transición?         │
│    - lotes_service: coordina crear/evento/consulta        │
│    - qr_service: arma y firma el certificado QR           │
│    - payments: orquesta el pago on-chain (3%/97%)         │
│    Es la única capa que CONOCE las reglas de negocio       │
├───────────────────────────────────────────────────────────┤
│ 3. Capa de acceso a datos (repository)                        │
│    - Traduce las peticiones a queries de Supabase         │
│    - lote_eventos: SOLO INSERT (append-only)              │
│    - lotes: UPDATE del estado actual (denorm)              │
├───────────────────────────────────────────────────────────┤
│ 4. Capa de infraestructura                                     │
│    - Supabase client (pool)                                  │
│    - Web3 client (nodo Polygon)  → firma y envía tx          │
│    - Secrets en variables de entorno (nunca en código)      │
└───────────────────────────────────────────────────────────┘
```

### Reglas que garantizan la separación

- Una capa **no puede** saltarse a la interior (router no escribe SQL). Si lo hace, se rompe la inmutabilidad de la trazabilidad.
- Los services concentran el **"qué"**; la infraestructura el **"cómo"**. Swaps de BD o de red no afectan la regla de estados.
- Respuesta siempre con DTO de salida (sin campos internos ni claves).

### Puntos de entrada (endpoints)

**Diseño de la API (buenas prácticas REST aplicadas con la skill FastAPI):**

| Método | Ruta | Qué hace | Idempotencia | Códigos |
|---|---|---|---|---|
| `POST` | `/v1/lotes` | Crear lote en estado CEREZA | No (da id) | `201` · `400` · `422` |
| `POST` | `/v1/lotes/{id}/eventos` | Registrar transición de estado | `Idempotency-Key` | `201` · `409` · `422` |
| `GET` | `/v1/lotes/{id}` | Consultar lote + historial | Sí | `200` · `404` |
| `GET` | `/v1/lotes` | Listar lotes (paginado por cursor) | Sí | `200` · `400` |
| `GET` | `/v1/verificar/{qr_codigo}` | Verificación pública (sin auth) | Sí | `200` · `404` · `409` |
| `POST` | `/v1/pagos` | Disparar pago on-chain (cooperativa) | `Idempotency-Key` | `202` · `409` · `422` |
| `POST` | `/v1/sync` | Batch de operaciones offline | Sí (reusa ids) | `202` · `207` |
| `POST` | `/v1/auth/login` | Login (JWT de Supabase) | No | `200` · `401` |
| `POST` | `/v1/auth/refresh` | Renovar token | No | `200` · `401` |
| `GET` | `/v1/cooperativas` | Listar cooperativas (admin) | Sí | `200` · `403` |

**Reglas aplicadas:**
- Recursos en plural (`/lotes`, `/eventos`); anidamiento solo en jerarquías reales (`/lotes/{id}/eventos`).
- Las transiciones y pagos son **acciones** → `POST`, no `PUT` de estado; se usa `Idempotency-Key` para que un retry offline no duplique el evento.
- Nada de `DELETE` en trazabilidad: lo físico se "cancela" con el estado `RECHAZADO` (se conserva la historia).
- Versionado por URL (`/v1/`): los teléfonos en campo no se actualizan el mismo día; la versión vieja de la API debe seguir viva.
- Paginación por cursor (`?cursor=..&limit=..`) en vez de `OFFSET` (evita escaneos lentos en tablas grandes).
- Códigos 2xx con semántica correcta: `200` (lectura), `201` (creado), `202` (pago asíncrono on-chain), `207` (multi-status en sync).

### Flujo de una transición (diagrama de secuencia)

```mermaid
sequenceDiagram
    autonumber
    actor P as Productor (móvil)
    participant API as Backend FastAPI
    participant DB as Supabase (Postgres)
    participant SC as CoffeePayments (Polygon)

    P->>API: POST /v1/lotes/{id}/eventos (CEREZA→PERGAMINO)
    API->>DB: Validar JWT + estado actual del lote
    DB-->>API: estado OK (CEREZA)
    alt Transición permitida
        API->>DB: INSERT lote_eventos (append-only)
        API->>DB: UPDATE lotes (estado → PERGAMINO)
        API-->>P: 201 Created
    else Transición inválida
        API-->>P: 409 Estado no permitido
    end
```

> La app **nunca** escribe directo a la BD: todo pasa por FastAPI, que valida JWT y la máquina de estados. La app en modo offline guarda en su SQLite local y sincroniza después (ver §7).

### Idempotencia y append-only (diagrama)

Los eventos y pagos usan la cabecera `Idempotency-Key` (UUID generado por el móvil). Ese UUID **es el PK** del evento en `lote_eventos`, de modo que reenviar la misma operación (retry offline, doble tap) **no duplica** el historial: el servidor detecta la clave y devuelve el lote tal como quedó.

```mermaid
sequenceDiagram
    autonumber
    actor M as Móvil (productor)
    participant API as Backend FastAPI
    participant DB as Supabase

    M->>API: POST /v1/lotes/{id}/eventos + Idempotency-Key: K
    API->>DB: ¿existe evento con id=K?
    alt No existe (primera vez)
        API->>DB: INSERT lote_eventos (id=K) · UPDATE lotes.estado
        API-->>M: 201 Created
    else Ya existe (retry)
        API-->>M: 201 Created (mismo estado final, sin re-aplicar)
    end
```

- `lote_eventos` es **append-only**: su repositorio solo expone `insert`/`select` y la BD bloquea `update`/`delete` con trigger (migración 003).
- El mismo mecanismo aplica a `POST /v1/pagos`: la columna `pago.idempotency_key` es `UNIQUE` (§9), de modo que reenviar una venta no dispara dos pagos on-chain.
- En el sync (`POST /v1/sync`) cada operación lleva su propio `id`; por eso es seguro reenviar el batch completo (202) aunque algunas ya se hayan aplicado. Si alguna operación del batch no se pudo aplicar (conflicto de estados, error de dominio o error interno) se responde `207` con el detalle por `op_id`; el cliente solo reenvía las no aplicadas.

### Validación de entrada / salida (Pydantic)

- Todo `body` pasa por modelos Pydantic: tipos fuertes, límites (`Field(gt=0)`) y enum de estados.
- Toda respuesta usa `response_model` / tipo de retorno para no exponer campos internos (ej. claves privadas).
- Errores de negocio: HTTP 422 (validación) o 409 (estado inválido), mensajes en español.

---

## 7. Aplicación móvil (React Native / Expo) — lógica

> La app es la **cara del productor en campo**: registrar cosechas con 3 toques, ver el estado de cada lote y generar su QR. Está pensada para usarse bajo el sol y sin conexión.
> Buenas prácticas aplicadas de las skills oficiales: **vercel-react-native-skills** (índices de rendimiento, navegación, UI) y **react-native-best-practices** (performance, perfilado).

### 7.1 Responsabilidades de la app (lógica)

| Responsabilidad | Qué hace | ¿Dónde vive? |
|---|---|---|
| Registrar cosecha/eventos | Captura en campo, valida en el dispositivo | Pantallas + formularios |
| Lógica offline | Escribe primero en SQLite local, encola y sincroniza | Subcapa `db` + `sync` |
| Ver el historial de un lote | Muestra la máquina de estados de forma visual | Pantalla de detalle |
| Escanear / mostrar QR | Generación y verificación con el consumidor | Pantalla de QR |
| Autenticación | Login/refresh con Supabase Auth (JWT) | Subcapa auth |

### 7.2 Capas internas de la app (sin código)

```
┌───────────────────────────────────────────────┐
│ Pantallas (expo-router)                        │
│   - index: lista de lotes (con estado actual)  │
│   - registro: captura de cosecha/evento        │
│   - detalle: historial del lote                │
│   - qr: escanear / verificar                   │
├───────────────────────────────────────────────┤
│ Estado de UI (Zustand / Jotai)                 │
│   - loteStore (estado actual del lote en cache)│
│   - syncStore (contador, pendientes, errores)  │
├───────────────────────────────────────────────┤
│ Repositorio local (SQLite)                     │
│   - lecturas SIEMPRE desde el local            │
│   - cola de operaciones pendientes (sync_queue)│
├───────────────────────────────────────────────┤
│ Cliente de red (HTTP a FastAPI)              │
│   - envía operaciones online o en lote         │
│   - autentica con JWT de Supabase              │
└───────────────────────────────────────────────┘
```

### 7.3 Navegación y flujo de pantallas

- **Navegación nativa** (expo-router con native stack/tabs) según la skill Vercel (evitar JS navigators por rendimiento y comportamiento de plataforma).
- Rutas de la app: Home → Detalle de lote → Registro de evento → QR. Verificación QR es público (sin login).

```mermaid
flowchart LR
    A[Login] --> B[Home: lista de lotes]
    B --> C[Registrar cosecha CEREZA]
    B --> D[Detalle de lote]
    D --> E[Historial de eventos]
    D --> F[Generar QR]
    D --> G[Registrar evento/transición]
    C --> B
    F --> H[Verificación pública QR]
    G --> D
```

### 7.4 Rendimiento y experiencia en campo (skills oficiales)

- **Listas** de lotes/historial: lista virtualizada (FlashList), nunca `ScrollView` con `map` — los teléfonos de campo son baratos y en memoria viven los datos.
- **Re-render**: estado atómico con selectores (Zustand) en vez de un contexto global enorme.
- **UI en campo**: controles grandes, alto contraste, guardar con un solo botón; íconos claros (memoria: alfabetización digital variada).
- **Perfilado antes de optimizar**: medir (react-devtools/profilares), optimizar, re-medir — evita memoización a ciegas.

### 7.5 Módulo offline-first (mobile ↔ backend)

> Problema real: en la sierra no hay conectividad. La app debe funcionar **sin internet** y sincronizar después.
> Esto es parte de la capa `db` + `sync` de la app (ver §7.2).

```
App Mobile (Expo)
   ● ¿Hay conexión?  (NetInfo)
   ├── sí ──► SQLite local como caché de lecturas + envía operaciones
   │           y las marca como "sincronizadas"
   └── no ──► SQLite local: guarda eventos y encola la operación
              en la sync_queue

Al reconectarse (NetInfo / reintento con backoff) -->
   POST /v1/sync  (batch de operaciones pendientes)
   el backend procesa y responde resultado por operación
   la app marca cada una como 'ok' o 'conflicto' (LWW)
```

#### Decisiones clave de diseño (offline)

| Decisión | Regla |
|---|---|
| Ids | UUID generados **en el móvil** (evita conflicto de llaves primarias) |
| Cola local | Tabla `sync_queue` (operación tipada + payload + estado) |
| Lecturas | Siempre desde SQLite local → la UI nunca "se congela" |
| Reintentos | Backoff exponencial + notificación al reconectar |
| Conflictos | LWW (*last-write-wins*) por `updated_at` |
| Integridad | `lote_eventos` del servidor SIEMPRE es la fuente de verdad |

#### Secuencia de sincronización

```mermaid
sequenceDiagram
    autonumber
    actor U as Productor (móvil)
    participant App as App React Native
    participant SQLite as SQLite local
    participant API as Backend /v1/sync
    participant DB as Supabase

    U->>App: Registra evento (sin señal)
    App->>SQLite: guarda local + encola (pending)
    Note over App: NetInfo detecta conexión
    App->>API: POST /v1/sync (batch de ops con UUID)
    API->>DB: valida + inserta (append-only)
    DB-->>API: ok por operación
    API-->>App: 202/207 {op_id: ok|error}
    App->>SQLite: marca cada op como ok/conflicto
```

---

## 8. Certificado de Origen (QR público)

> Todo este sistema converge en un único artefacto para el consumidor: el **Certificado de Origen** emitido a través de un código QR. "Verificar el café" significa comprobar que el origen y los procesos declarados realmente ocurrieron.

- El QR codifica el `codigo` + `hash_sha256` del lote (no expone todo el historial en el propio QR; lo trae la API al validar).
- El certificado exhibe: productor, finca (municipio + altitud), fecha de cosecha, historial de procesos (CEREZA → PERGAMINO → ORO → TOSTADO) y la etapa actual.
- Al escanear → `GET /v1/verificar/{codigo}` (sin autenticación).
- Respuestas:
  - **Válido**: el Certificado de Origen con datos del lote + historial de eventos renderizado.
  - **No encontrado** → HTTP 404.
  - **Inválido/tampered** → HTTP 409.
- El `hash_sha256` permite verificar de forma independiente de la plataforma y, opcionalmente, dejar constancia on-chain (guardar el hash dentro del contrato, ver §9).

### Flujo de verificación (diagrama de secuencia)

```mermaid
sequenceDiagram
    autonumber
    actor C as Consumidor (móvil/cámara)
    participant API as Backend FastAPI
    participant DB as Supabase

    C->>C: Escanea el QR (codigo + hash en el código)
    C->>API: GET /v1/verificar/{codigo} (sin auth)
    API->>DB: SELECT qr_certificado WHERE codigo=?
    alt No existe
        API-->>C: 404 Código no encontrado
    end
    API->>DB: SELECT lotes + lote_eventos (historial)
    API->>API: Recalcula hash_sha256 del historial real
    alt hash coincide con el del certificado
        API->>DB: INSERT verificacion (auditoría de consulta)
        API-->>C: 200 Certificado de Origen (productor, finca, historial, estado)
    else hash no coincide (tampered)
        API-->>C: 409 Certificado inválido / manipulada
    end
```

> El QR en sí solo porta `codigo` + `hash_sha256`; el historial lo devuelve la API. Cualquier edición de `lote_eventos` rompería el hash → 409. El anclaje opcional del hash on-chain se documenta en `docs/06-contratos.md`.

---

## 9. Blockchain y pagos (Solidity / Polygon)

> **Estado v1 MVP**: el flujo on-chain está **diseñado** aquí y en `docs/06-contratos.md`, pero la integración web3 está **en pausa** (falta proyecto Supabase real y wallet del backend). En el código se ejecuta `FakeGatewayPagos` (tx determinista `0x<pago.id>` y confirmación simulada) que ya implementa el patrón 3%/97% y el poller `PENDIENTE → CONFIRMADO`. La wallet del productor (`public_address` en `USUARIOS`) se persistirá cuando se retome B11.

### Responsabilidad del Smart Contract `CoffeePayments.sol`

Responsabilidad exclusiva: el pago y la inmutabilidad de la transacción (*única responsabilidad*).
- Recibe la venta (`lote_id`, `productor`, `cantidad` → `peso_kg` del evento `VENTA`, `precio` → `monto_total`) **firmada por el backend**.
- Retiene el **3% de comisión** hacia la tesorería de la cooperativa.
- Envía el **97%** automáticamente a la wallet del productor (patrón *pull-over-push*).
- Emite eventos on-chain (`PaymentPaid(loteId, productorAddr, monto)`) para auditar.

### Buenas prácticas de la skill Solidity

- Solidity `0.8.x` (protección de overflow/underflow por el compilador).
- SafeERC20 + `ReentrancyGuard` (OpenZeppelin).
- Patrón *checks-effects-interactions*.
- Custom errors (más baratos en gas) en vez de `require("mensaje")`.
- La **llave privada del backend NUNCA está en el código**: se guarda como secreto de entorno (Supabase secrets / `.env`, que está en `.gitignore`).

### Red y despliegue

- **Testnet**: Polygon `Amoy` (testnet y compatibles actuales de Polygon).
- Deploy desde `contracts/script/` con **Foundry** (`forge script ... --rpc-url ...`).
- Fondos de prueba: faucet de Amoy (MATIC de prueba, gratis).
- En producción se evalúa Mainnet; Polygon (L2) mantiene gas bajo porque hereda seguridad de Ethereum.

> La especificación completa del contrato, el flujo y el estado de la
> implementación viven en **`docs/06-contratos.md`**. La implementación web3
> está **en pausa** (B7): el MVP corre con `FakeGatewayPagos`.

### Flujo de pago por el backend (diagrama de secuencia)

```mermaid
sequenceDiagram
    autonumber
    participant B as Backend FastAPI
    participant SC as CoffeePayments (Polygon)
    participant DB as Supabase (pagos)

    B->>B: Recibe venta (lote, precio, productor, comprador)
    B->>B: Calcula comisión 3% y neto 97%
    B->>B: Firma del mensaje de la venta (wallet del backend)
    B->>SC: coffeePayments.pay(venta_firmada)
    SC-->>B: tx_hash enviado
    B->>DB: guarda tx_hash + estado_pago=PENDIENTE
    DB-->>B: ok
    Note over B,SC: Confirmación asíncrona (202): el tx se confirma en bloques después. Estado → CONFIRMADO vía evento del contrato.
    B-->>B: notifica al productor (pago automático)
```

> Si el productor todavía no tiene wallet, se le asigna/genera una al registrarse: su `public_address` vive en la tabla **`USUARIOS`** (única fuente de verdad de la wallet). En campo (offline) la dirección se puede crear localmente y validarse al sincronizar.
> El pago se dispara desde la cuenta de la **cooperativa** (autor de la venta); el contrato envía el 97% a la wallet del productor y retiene el 3% hacia la tesorería de la cooperativa.

---

## 10. Roles y permisos (Supabase RLS + JWT)

Los roles se modelan en la tabla **`USUARIOS.rol`** (`productor | cooperativa | comprador | admin`). El consumidor final **no tiene cuenta** en el sistema: verifica vía el endpoint público `/verificar` (sin token).

| Rol | Lectura | Escritura | ¿Cuenta? |
|---|---|---|---|
| **productor** | Sus fincas y sus lotes | Eventos de sus lotes | Sí |
| **cooperativa** | Todos los lotes de sus fincas | Gestión de lotes, productores, pagos | Sí |
| **comprador** | Lotes verificables (QR público) | — | Sí |
| **consumidor** | Solo QR `/verificar` (público) | — | No |
| **admin** | Todo | Configuración, cooperativas | Sí |

- **Autenticación**: Supabase Auth (email/contraseña, o *magic link* para productores sin email). El `auth.uid()` de Supabase **es** el `USUARIOS.id` (mismo UUID vinculado al registrarse).
- **Autorización**: RLS en PostgreSQL — las políticas resuelven el rol desde `USUARIOS` y restringen por pertenencia (`PRODUCTOR` de la finca, `COOPERATIVA` de la finca) **sin confiar en IDs enviados por el cliente**; adicionalmente la dependencia `get_current_user` en FastAPI fuerza el mismo chequeo a nivel de API.

### Flujo de autenticación (diagrama de secuencia)

```mermaid
sequenceDiagram
    autonumber
    actor M as Móvil
    participant API as Backend FastAPI
    participant AUTH as Supabase Auth / LocalAuth
    participant DB as Supabase (usuarios)

    M->>API: POST /v1/auth/login (email + password)
    API->>AUTH: Valida credenciales
    AUTH-->>API: tokens (access + refresh)
    API-->>M: 200 TokenResponse

    Note over M,DB: Cada request autenticado:
    M->>API: GET /v1/lotes + Authorization: Bearer <jwt>
    API->>AUTH: Verifica firma/exp (HS256 local o JWKS)
    API->>DB: Resuelve rol REAL desde usuarios WHERE id = auth.uid()
    API->>API: require_rol(...) → 401/403 o CurrentUser
```

> El rol de negocio **jamás** se lee del claim `role` del JWT (Supabase siempre dice `authenticated`): se resuelve desde la tabla `usuarios` por el `sub`. Los tokens del proveedor local (desarrollo) son HS256; en producción se valida con JWKS (RS256/ES256) del proyecto real y el proveedor local queda bloqueado por configuración.

### Matriz de permisos RLS (por tabla)

| Tabla | productor | cooperativa | comprador | admin |
|---|---|---|---|---|
| `usuarios` | propia (lectura) | propia (lectura) | propia (lectura) | todo |
| `cooperativa` | — | — | — | lectura |
| `finca` | propias (lectura) | propias + de sus productores (lectura) | — | todo |
| `lotes` | de sus fincas | de sus fincas | — (solo `/verificar`) | todo |
| `lote_eventos` | de sus lotes (append-only) | de sus lotes (append-only) | — | todo |
| `qr_certificado` | de sus lotes | de sus lotes | — | todo |
| `pago` | de sus lotes (lectura) | propias (escritura) | — | todo |
| `verificacion` | de sus lotes | de sus lotes | — | todo |

La matriz está implementada en `Backend/db/migrations/002_rls.sql` y es la misma regla que replica la capa de servicio en FastAPI (doble control, §12).

---

## 11. Decisiones de arquitectura (ADR) ya tomadas

1. **`backend = FastAPI + Supabase`**: las reglas de estados del café justifican una API propia (coherencia con la memoria técnica) y Supabase provee la persistencia con menos infraestructura propia.
2. **Event-sourcing ligero** (`lotes` + `lote_eventos`): separación estado vs su historial para inmutabilidad real.
3. **UUID generados en el móvil**: requisito del offline-first sin colisión central.
4. **QR con hash (sin estado frágil en BD)**: rápido y comprobable para el consumidor.
5. **Contrato separado del backend**: inmutabilidad de los pagos y auditoría independiente.
6. **`USUARIOS` como tabla central de identidad**: credenciales y wallet viven en `USUARIOS`; `PRODUCTOR`/`COOPERATIVA`/`COMPRADOR` solo agregan el rol de negocio (RLS se ancla a `USUARIOS`, no a la entidad concreta).
7. **Web3 en pausa en el MVP** (B7): el contrato `CoffeePayments.sol` se especifica en `docs/06-contratos.md` pero no se implementa en este milestone; el MVP usa `FakeGatewayPagos`. Evita deuda: la interfaz y la idempotencia (`idempotency_key UNIQUE`) ya están resueltas.
8. **Dinero como `real`/`float` con CHECK** según ERD; migrar a `NUMERIC`/`Decimal` es una mejora futura documentada (no bloquea el MVP).

Cada decisión se documenta en esta misma sección (ADR 1–8) con plantilla: Título · Contexto · Decisión · Consecuencias.

---

## 12. Buenas prácticas obligatorias en el desarrollo

### Backend (FastAPI / Python)
- Estructura modular: los routers declaran su propio `prefix`, `tags` y `dependencies` en el `APIRouter` (no en `include_router`).
- **Una operación HTTP = una función** (nunca mezclar `GET`/`POST` en el mismo handler).
- `Annotated` + `Depends` para toda inyección de dependencias; dependencias compartidas a nivel de router.
- **Tipos de retorno** en path operations (`-> LoteRead`): validan, filtran y serializan (evita exponer campos internos como la wallet o `hash_sha256` parcial).
- Endpoints de E/S **blocking** (Supabase SDK) en `def` síncrono (se ejecutan en threadpool), no dentro de `async` — evita bloquear el event loop.
- **Nunca** claves privadas en el código: solo variables de entorno (`.env` ignorado por git).
- Linter: Ruff. Pruebas: pytest (en `Backend/tests/`).

### Diseño orientado a objetos (dominio)
- El `Lote` es el **aggregate root**: toda modificación sobre él pasa por sus métodos (no se modifica por acceso directo).
- `LoteEvento` es un **value object inmutable** (creación única, sin setters) — nos garantiza trazabilidad.
- Los estados se modelan con el **patrón State** (o un mapa de transiciones `MaquinaEstados`), nunca con `if/case` gigantes.
- Repositorios y gateways se declaran como **interfaces** (`RepositorioLote`, `GatewayPagos`) → el dominio no depende de Supabase ni de Polygon (inversión de dependencias).
- Servicios de aplicación = capa de comportamiento; routers = solo presentación (ver §4 OOP y §6).

### Base de datos (PostgreSQL / Supabase)
- ENUM para estados, `TIMESTAMPTZ`, CHECK constraints, UUID `gen_random_uuid()`.
- `lote_eventos` como **append-only** (nada de UPDATE/DELETE).
- Índices para las consultas más usadas (búsqueda por código QR, historial por lote).
- RLS por cooperativa; la app nunca ve filas ajenas (skill Supabase best practices).

### Blockchain (Solidity)
- 0.8.0+, OpenZeppelin, `ReentrancyGuard`, *pull-over-push*, custom errors.
- Auditoría estática con **Slither** antes de desplegar en testnet.
- La llave privada de firma, fuera del repo.

### React Native (skills Vercel + Callstack)
- Navegación **nativa** (expo-router, native stack/tabs) en vez de JS navigators.
- Listas con **FlashList** (virtualización) — nunca `ScrollView` con `map`.
- Estado atómico (**Zustand/Jotai**) con selectores para minimizar re-renders.
- Imágenes con **expo-image**; preservar dimensiones (evita layout shift).
- Medir (profilers) antes de optimizar; no memoizar a ciegas.

---

## 13. Glosario (para hablar el mismo idioma)

| Término | Significado |
|---|---|
| **Lote** | Conjunto de café del mismo proceso/productor registrado (unidad de trazabilidad) |
| **Evento de estado** | Una transición registrada del lote (CEREZA → PERGAMINO, etc.) |
| **CEREZA** | Café en fruto rojo al momento de la cosecha |
| **PERGAMINO** | Café después de despulpado y secado |
| **ORO** | Café verde descascarado, listo para comercializar |
| **TOSTADO** | Café tostado → habilita el QR |
| **Certificado de Origen** | El QR: prueba digital de dónde y cómo se produjo el lote (finca, productor, altitud, procesos) |
| **QR público** | Código escaneable que porta el Certificado de Origen y verifica la trazabilidad |
| **Smart Contract** | Programa en blockchain que ejecuta el pago justo (comisión 3%) |
| **Append-only** | Tabla donde solo se inserta, jamás se edita (evidencia) |
| **Offline-first** | La app funciona sin internet y sincroniza después |
| **LWW** | Last-Write-Wins: el último cambio gana los conflictos de sync |
| **Aggregate root** | Entidad (el Lote) que garantiza consistencia sobre su historia |

---

## 14. Flujo de desarrollo propuesto (equipo pequeño)

1. **Dominio**: definir y documentar la máquina de estados + reglas (consolidado en este documento, §6; Issue 1).
2. **Modelo de datos**: ERD + migración inicial → §5 + `db/migrations/` (Issue 2).
3. **API contrato**: rutas + schemas Pydantic + flujo → §6–§8 + `docs/06-contratos.md` (Issue 3).
4. **UI mobile**: wireframes + árbol de navegación → `mobile/` (Issue 4, pendiente).
5. **Offline-sync**: diseño completo → §7.5 (Issue 5).
6. **Backend**: montar `Backend/` (FastAPI) empezando por el corazón (máquina de estados + QR público).
7. **Móvil**: `mobile/` con Expo (registro + QR funcional).
8. **Contracts**: `CoffeePayments.sol` + pruebas + deploy en testnet.

Cada integrante trabaja en su rama por feature; `docs/ARCHITECTURE.md` es la fuente única de verdad del diseño.

---

*Bean Trust — Memoria técnica y modelo de negocio, InnovaTecNM 2026.*