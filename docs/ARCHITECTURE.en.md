# Bean Trust Architecture

> Reference document for autonomous team development.
> Goal: for any team member to understand **what each piece does** and **why it's designed this way**, before writing code.

> *This is the English translation of [`ARCHITECTURE.md`](./ARCHITECTURE.md). If the two ever diverge, treat the Spanish version as the source of truth and flag the mismatch.*

---

## 1. What is Bean Trust? (30-second summary)

Bean Trust is a **blockchain platform for traceability and fair trade of coffee from Veracruz**.

It solves two problems documented in the project's technical memory:

1. **Coyotaje / excessive intermediation**: a middleman absorbs up to 70% of the coffee's value.
2. **Lack of trustworthy certification**: paper certifications are slow, expensive, and forgeable.

The system gives each coffee bean a **digital identity** through blockchain technology:

- Records key events in the chain (harvest, processing, roasting) **immutably**.
- Issues a **Coffee Passport**: a unique **QR code** the consumer scans to verify certified organic origin (producer, farm, altitude, variety, process history, per-stage hash).
- Executes **fair, automatic payments** to the producer via **Smart Contracts**.

Business model (B2B2C): the producer **does not pay**. Cooperatives (subscription) and specialty buyers (3% transaction fee executed by the Smart Contract) pay. The end consumer just scans the QR; their demand for transparency is what gives value to the whole chain.

---

## 2. Architecture overview

```
┌─────────────────────┐      ┌───────────────────────────┐
│      Mobile App     │      │    Polygon Network (L2)    │
│ (React Native/Expo) │      │   ┌────────────────────┐  │
│                     │      │   │ Smart Contract     │  │
│ ┌───────────────┐   │      │   │ CoffeePayments.sol │  │
│ │ Local SQLite  │   │      │   └─────────┬──────────┘  │
│ │(offline queue)│   │      │             │ web3         │
│ └───────┬───────┘   │      └─────────────┼─────────────┘
└─────────┼───────────┘                    │
          │ HTTP/JSON (API)                │
┌─────────┼────────────────────────────────┼───────────┐
│ Backend ▼                                ▼           │
│ ┌─────────────────────────┐  ┌─────────────────────┐ │
│ │ Contract API             │  │ Web3 Module         │ │
│ │ (FastAPI)                │  │ (web3.py / scripts) │ │
│ │ - Business rules         │  │ - Signing            │ │
│ │ - Public QR              │  │ - Testnet deploy    │ │
│ │ - Offline sync           │  │                     │ │
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

### Separation of responsibilities (modular decision)

- **FastAPI** is the only gate that validates business rules and the only one that knows the coffee state machine. **The app never writes directly to the database.**
- **Supabase** is the relational source of truth (PostgreSQL) + Auth + Row Level Security (RLS) + Storage (a **private** evidence bucket; the app never talks to Storage, only to FastAPI).
- **Smart Contracts (Polygon)**: only contain the *flow of money*, never the full business logic. The current MVP uses `FakeGatewayPagos`; the real integration resumes first on testnet.

| Component | Role | Consumed by |
|---|---|---|
| **Mobile App** | Field registration, QR, basic dashboards | Producers, cooperatives |
| **FastAPI** | Contract API, orchestration, state rules, sync, web3 | Mobile, public QR |
| **Supabase** | Relational persistence, Auth, RLS, Storage | FastAPI, web dashboards |
| **Smart Contracts** | Automatic fair payment, on-chain immutability | Backend, cooperatives |
| **Docs / ADR** | Decisions, diagrams, business rules | Whole team |

---

## 3. Folder structure (monorepo)

```
BeanTrust/
├── docs/
│   ├── ARCHITECTURE.md        # Spanish original (source of truth for the design)
│   ├── ARCHITECTURE.en.md     # ← This document (English translation)
│   ├── 06-contratos.md         # Solidity contracts (web3 design)
│   ├── guia-blockchain-testnet.md # Free path for Polygon Amoy
│   └── (ADRs live inline in §11 of ARCHITECTURE.md)
├── Backend/                     # FastAPI (capitalized folder)
│   ├── app/
│   │   ├── main.py              # crear_app() + domain error handler
│   │   ├── core/                 # config, security (JWT + argon2), logger
│   │   ├── api/v1/
│   │   │   ├── router.py         # Mounts ALL /v1 routers (includes tips)
│   │   │   └── endpoints/        # auth, cooperativas, lotes, eventos, verificacion, pagos, sync, evidencias
│   │   ├── models/dominio.py     # Business rules (state machine) — no I/O
│   │   ├── schemas/              # Pydantic → input/output validation
│   │   ├── services/             # lotes, qr, pagos, propinas, evidencias (use cases)
│   │   ├── repositories/         # Interfaces + in_memory + supabase + payment gateway
│   │   ├── utils/                # pure helpers (base64url cursor, hashing)
│   │   └── dependencies.py       # Shared DI (Annotated + Depends)
│   ├── db/                       # SQL migrations + seed (Supabase/PostgreSQL)
│   ├── tests/                    # unit/ + integration/ (includes test_contrato_api.py)
│   └── pyproject.toml
├── supabase/                   # Local Supabase config
│   ├── migrations -> ../Backend/db/migrations   # symlink to the migrations
│   ├── functions/purge-staged-evidence/         # daily purge Edge Function
│   └── tests/                  # pgTAP (RLS, Storage, rate limit)
├── mobile/                     # React Native (Expo Router) — see §7
│   ├── app/                    # Screens (login, register, dashboard, verify, market...)
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── api/                # HTTP client (auth, lots, sync, evidence)
│   │   ├── offline/            # SQLite + NetInfo (cache, FIFO queue, attachments)
│   │   ├── evidencia/          # Photo capture/normalization (JPEG + SHA-256)
│   │   ├── store/              # Auth state (zustand) + JWT util
│   │   ├── storage/            # SecureStore (tokens)
│   │   └── theme/              # "Copa de cata" design tokens
│   └── package.json            # scripts: start, lint, typecheck
├── AGENTS.md                   # ← Persistent memory and docs↔code alignment rules
└── README.md
```

> **`contracts/` (Solidity) and a root `db/` do NOT exist yet.** The MVP uses a
> fake gateway for payments/tips; blockchain integration resumes on testnet
> through `docs/guia-blockchain-testnet.md`. The real DB lives in `Backend/db/`.
> The source of truth for the real structure is this monorepo (not the old
> sections of this document or the root README).

---

## 4. Domain model: the journey of the bean

> Golden rule: the **Lot** is the base entity (aggregate / core of the model) and moves through discrete **states**. The **history** of a Lot is a list of **immutable events** that is **never rewritten** (append-only).

### Coffee states

```mermaid
stateDiagram-v2
    direction TB

    [*] --> CEREZA
    CEREZA --> CEREZA : LIMPIEZA
    CEREZA --> PERGAMINO : DESPULPADO
    PERGAMINO --> PERGAMINO : FERMENTACION / LAVADO\nSECADO / REPOSO
    PERGAMINO --> ORO : DESCASCARADO
    ORO --> ORO : CLASIFICACION
    ORO --> TOSTADO : TOSTADO\n(enables Coffee Passport QR)
    TOSTADO --> VENDIDO : VENTA\n(triggers on-chain payment)
    CEREZA --> RECHAZADO
    PERGAMINO --> RECHAZADO
    ORO --> RECHAZADO
    TOSTADO --> RECHAZADO
    VENDIDO --> RECHAZADO
    VENDIDO --> [*]

    note right of CEREZA
       COSECHA creates the lot:
       - Producer, farm
       - Variety
       - Weight (kg)
       - Evidence (id → private Storage)
       - Generates UNIQUE lot code
    end note
    note right of VENDIDO
       When the sale is registered, the backend
       signs and executes the Smart Contract
       that pays 97% to the producer and
       withholds the commission (3%).
    end note
    note left of PERGAMINO
       Sub-stages with no strict order:
       fermentation, washing, drying, resting.
       Recorded as auto-transitions
       (PERGAMINO → PERGAMINO).
    end note
```

### Transition business rules (full chain with auto-transitions)

> **Full chain with auto-transitions.** The **milestones** (states) are `CEREZA → PERGAMINO → ORO → TOSTADO → VENDIDO` (+ `RECHAZADO`). Each **milestone** accepts **sub-stages** recorded as **auto-transitions** (the state doesn't change, but evidence is left in history).

| Transition | EventType | Required action | Fields checked |
|---|---|---|---|
| `→ CEREZA` | `COSECHA` | Creates the lot (aggregate) | `variedad`, `peso_kg`, `evidencia_id`, `actor_id` |
| `CEREZA → CEREZA` | `LIMPIEZA` | Cherry cleaning | `peso_kg`, `actor_id` |
| `CEREZA → PERGAMINO` | `DESPULPADO` | Pulping | `merma_pct`, `peso_kg`, `metodo_beneficiado` (lavado/semilavado/honey/natural), `metodo_fermentacion`, `actor_id` |
| `PERGAMINO → PERGAMINO` | `FERMENTACION` | Controlled fermentation | `metodo_fermentacion`, `horas`, `pH`/`Brix` (optional), `actor_id` |
| `PERGAMINO → PERGAMINO` | `LAVADO` | Parchment washing | `peso_kg`, `actor_id` |
| `PERGAMINO → PERGAMINO` | `SECADO` | Drying (patio/mechanical) | `humedad_inicial_pct`, `humedad_final_pct`, `metodo_secado`, `actor_id` |
| `PERGAMINO → PERGAMINO` | `REPOSO` | Resting the parchment | `dias`, `actor_id` |
| `PERGAMINO → ORO` | `DESCASCARADO` | Hulling → green coffee | `peso_kg`, `merma_pct`, `actor_id` |
| `ORO → ORO` | `CLASIFICACION` | Grading and quality control | `puntaje_sca`, `defectos`, `densidad`, `tamiz`, `actor_id` |
| `ORO → TOSTADO` | `TOSTADO` | Roasting at the plant | roasting date (`registrado_en`), `actor_id` |
| `TOSTADO → VENDIDO` | `VENTA` | Price/sale registration | `monto_total`, `comprador_id`, `tx_hash` |
| `any → RECHAZADO` | `RECHAZADO` | Lot rejection | reason, `actor_id` |

**Business invariants (prohibitions)**:
- Cannot skip **milestones** (`CEREZA → ORO` = error): every milestone change must pass through the intermediate.
- **Sub-stages** are only recorded within **their milestone** (`CLASIFICACION` only in `ORO`, `SECADO` only in `PERGAMINO`, etc.) but **with no strict order** among them.
- **No going back after `TOSTADO`** (physically irreversible): `VENDIDO` is terminal and `RECHAZADO` is absorbing.
- Weight loss can never be negative.
- Every event records who did it (`actor_id`) and a timezone-aware `timestamp` (UTC).
- **Append-only**: history is never rewritten.
- **Deterministic hash**: the chain hash is computed in order (`registrado_en`, `id`) — see §8 and ADR-11.

### Object-oriented design (OOP) — the heart of the domain

> **Why OOP?** Bean Trust's problem is a **rich domain model**: the Lot is not a simple record, it's an object that **has a lifecycle**, **validates its own transitions**, and **issues its certificate and payment**. Modeling it with objects lets those rules live **next to the data** (encapsulation) instead of scattered across scripts.

Concrete benefits we get from OOP here (based on the Python skill + DDD domain pattern):

1. **Encapsulation**: `Lot` knows its history and *can't be tricked* into jumping from CEREZA straight to ORO. The caller simply asks to "advance"; the object validates or raises an error.
2. **Event immutability**: `LotEvent` is an **immutable value object**: it's created and never modified. This is what makes traceability verifiable (same principle as append-only in the DB).
3. **Controlled polymorphism** for states: each state (`CherryState`, `ParchmentState`, …) can have its own exit-validation logic. It's managed with the **StateMachine** (State pattern), not with giant `if/case` blocks in the API.
4. **Dependency Inversion (DI)**: the application service depends on **interfaces** (`LotRepository`, `PaymentGateway`), not directly on Supabase or Polygon → infrastructure changes don't touch business logic.

**OOP best practices from the Python skill applied to this domain:**

| Skill (best practice) | How it's applied in Bean Trust |
|---|---|
| **Pydantic at the boundaries (schemas)** | The domain `Lot` is a plain class (or `@dataclass`); `LotCreate`/`EventCreate` with Pydantic validate input/output **in the router**. Transport validation isn't mixed with business logic. |
| **Immutable value object (`frozen=True`)** | `LotEvent` is defined `@dataclass(frozen=True)`: it's created, read, never modified → history can't be altered or reordered. (Skill gotcha: `dataclass` for internal structs, Pydantic only at API boundaries.) |
| **`Enum` instead of magic strings** | `State` and `EventType` are Python `enum.Enum`: the compiler/linter catches typos and only allows valid values in `StateMachine`. |
| **Careful with `bool` as a subclass of `int`** | When validating `isValidTransition(...)`, never compare with `== True`; use `is` or type `bool` explicitly in the signature (skill gotcha). |
| **FastAPI `Depends` for DI** | Repositories/gateways (`SupabaseLotRepo`, `PaymentGateway`) are injected with `Annotated` + `Depends` (FastAPI skill). The domain talks only to interfaces → testable with mocks. |
| **No bare `dict`s** | Everything that crosses the boundary goes through typed Pydantic models; the domain never receives a `dict.get("x")` that can silently fail (skill gotcha). |

**Class diagram (OOP):**

```mermaid
classDiagram
    class Lot {
        <<aggregate root>>
        -UUID id
        -UUID farm_id
        -String public_code
        -State state
        -float current_weight_kg
        -Date harvest_date
        -String variety
        +register(HarvestEvent) LotEvent
        +advance(type: EventType) LotEvent
        +generateCertificate() QRCertificate
        +attachSale(sale: Sale) Payment
        +isValidTransition(to: State) bool
    }

    class LotEvent {
        <<immutable value object>>
        -UUID id
        -UUID lot_id
        -State from_state
        -State to_state
        -EventType type
        -float loss_pct
        -float weight_kg
        -String processing_method
        -String fermentation_method
        -float initial_humidity_pct
        -float final_humidity_pct
        -String drying_method
        -float sca_score
        -String stage_hash
        -UUID actor_id
        -Instant registered_at
    }

    class QRCertificate {
        <<entity>>
        -UUID id
        -UUID lot_id
        -String code
        -String sha256_hash
        -Instant issued_at
        +verifyEntry(code: String) bool
    }

    class Payment {
        <<entity>>
        -UUID id
        -UUID lot_id
        -float total_amount
        -float commission_pct
        -float producer_amount
        -String tx_hash
        -PaymentStatus payment_status
        +confirm() void
    }

    class Tip {
        <<bivalent entity>>
        -UUID id
        -UUID lot_id
        -UUID buyer_id
        -UUID producer_id
        -float amount
        -Currency currency
        -TipStatus tip_status  // REGISTERED|PENDING|CONFIRMED
        -String idempotency_key
        +confirm() void
    }

    class Farm {
        <<entity>>
        -UUID id
        -UUID producer_id
        -UUID cooperative_id
        -String name
        -String municipality
        -float min_altitude
        -float max_altitude
        -bool organic
    }

    class Producer {
        <<entity>>
        -UUID id
        -String name
        -List Farms
    }

    class StateMachine {
        <<service>>
        -Map transitions
        +isAllowed(from: State, to: State): boolean
    }

    class LotRepository {
        <<interface>>
        +findById(UUID) Lot
        +save(Lot)
        +appendEvent(LotEvent)
    }

    class SupabaseLotRepo {
        +findById(UUID) Lot
        +save(Lot)
        +appendEvent(LotEvent)
    }

    class LotService {
        +registerHarvest(lot, event) LotEvent
        +advanceState(id, type) LotEvent
        +generateCertificate(id) QRCertificate
        +pay(lot, sale) Payment
    }

    class PaymentGateway {
        <<interface>>
        +issuePayment(sale: Sale) String  // tx_hash
    }

    LotRepository <|.. SupabaseLotRepo
    Lot "1" --> "0..*" LotEvent : records
    Lot "1" --> "0..1" QRCertificate : issues
    Lot "1" --> "0..1" Payment : settles
    Lot "1" --> "0..*" Tip : receives
    Lot "0..*" --> "1" Farm : belongs to
    Farm "0..*" --> "1" Producer : owner
    Lot --> StateMachine : validates against
    LotService ..> LotRepository : uses
    LotService ..> PaymentGateway : uses
```

> **`EventType` (expanded enum):** `COSECHA` · `LIMPIEZA` · `DESPULPADO` · `FERMENTACION` · `LAVADO` · `SECADO` · `REPOSO` · `DESCASCARADO` · `CLASIFICACION` · `TOSTADO` · `VENTA` · `RECHAZADO` (12 values: 11 transitions + rejection). Sub-stages (`LIMPIEZA`, `FERMENTACION`, `LAVADO`, `SECADO`, `REPOSO`, `CLASIFICACION`) are **auto-transitions**: `from_state == to_state`.

> **Implementation note:** this diagram is **conceptual** (CamelCase). In code names are snake_case (`LotService` = `lote_service`, `LotRepository` = `lote_repo`, `QrService` = `qr_service`), repos are protocols in `app/repositories/`, and the `Producer` entity is the `rol`/FK column of `User` (see ERD note in §5).

**Why each element exists:**

| Class | Why it exists | OOP principle |
|---|---|---|
| `Lot` (aggregate) | Single root identity that guarantees data consistency | Aggregate + Encapsulation |
| `LotEvent` | History is **immutable**: it's the evidence of traceability | Immutability / Value Object |
| `State` (enum + State classes) | Encapsulated state machine; prevents illegal transitions | State Pattern |
| `StateMachine` | Defines the transition table **declaratively** (a map, not if/case) | OCP (open for extension) |
| `LotRepository` (interface) | The domain doesn't depend on the DB (Supabase is a detail) | Dependency Inversion |
| `PaymentGateway` (interface) | The domain doesn't know how payment happens (Polygon is a detail) | Dependency Inversion |
| `Tip` | Buyer → producer, 100% direct, idempotent and bivalent | Entity + Idempotency (ADR-10) |
| `Farm`, `Producer` | On-farm context entities that the Coffee Passport must display | Bounded Context (origin) |
| Services | Separation: routers hold no logic; services decide "what" | Single Responsibility |

> **`HarvestEvent` and `Sale` are not domain entities**: they are **Pydantic schemas** (input DTOs) that cross the API boundary; the domain receives them, validates them, and converts them into `LotEvent` / `Payment`. They don't have their own table.

> This OOP structure maps, in FastAPI, to the skill's modules (services, schemas, repositories) and in the DB to the tables in §5. **This is not over-engineering**: it's 5–6 domain classes that give integrity to the central problem (not issuing false certificates).

---

## 5. Database model (PostgreSQL / Supabase)

### Core principle: current state + immutable history

- **`lots`**: one row with the **current state** (denormalized) → fast dashboard and QR reads.
- **`lot_events`**: **append-only**, stores every transition as an immutable event → traceability evidence.

This *lightweight event-sourcing* pattern is what makes certification provable: history is never edited.

### Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    USERS ||--o| PRODUCER : "is a (1-1)"
    USERS ||--o| COOPERATIVE : "is a (1-1)"
    USERS ||--o| BUYER : "is a (1-1)"
    PRODUCER ||--o{ FARM : "owns (1-N)"
    PRODUCER }o--o{ COOPERATIVE : "affiliated (N-M)"
    COOPERATIVE ||--o{ BUYER : "sells_to (1-N)"
    FARM ||--o{ LOT : "produces (1-N)"
    LOT ||--o{ LOT_EVENTS : "history (1-N)"
    LOT |o--o| QR_CERTIFICATE : "issues (0-1)"
    QR_CERTIFICATE ||--o{ VERIFICATION : "scans (1-N)"
    LOT |o--o| PAYMENT : "settles (0-1)"
    LOT ||--o{ TIP : "receives (1-N)"
    LOT |o--o| EVIDENCE : "evidence (0-1)"

    USERS {
        uuid id PK
        text email
        text public_address
        enum role "producer|cooperative|buyer|admin"
        timestamptz created_at
    }
    PRODUCER {
        uuid id PK
        uuid user_id FK
        text name
        text phone
        text municipality
    }
    FARM {
        uuid id PK
        uuid producer_id FK
        uuid cooperative_id FK
        text name
        text municipality
        real min_altitude
        real max_altitude
        boolean organic
        point location
    }
    COOPERATIVE {
        uuid id PK
        uuid user_id FK
        text name
        text rfc
        text contact
    }
    BUYER {
        uuid id PK
        uuid user_id FK
        uuid cooperative_id FK
        text name
        text contact
    }
    PRODUCER_COOPERATIVE {
        uuid producer_id FK
        uuid cooperative_id FK
        date affiliated_since
    }
    LOT {
        uuid id PK
        uuid farm_id FK
        text public_code
        enum state "CEREZA|PERGAMINO|ORO|TOSTADO|VENDIDO|RECHAZADO"
        real current_weight_kg
        date harvest_date
        text variety
        enum processing_method "lavado|semilavado|honey|natural"
        text evidence_url
        text evidence_sha256
    }
    LOT_EVENTS {
        uuid id PK
        uuid lot_id FK
        uuid actor_id FK "USERS"
        uuid buyer_id FK "VENTA only"
        enum type "COSECHA|LIMPIEZA|DESPULPADO|FERMENTACION|LAVADO|SECADO|REPOSO|DESCASCARADO|CLASIFICACION|TOSTADO|VENTA|RECHAZADO"
        enum from_state
        enum to_state
        real weight_kg
        real loss_pct
        text processing_method "DESPULPADO"
        text fermentation_method "DESPULPADO|FERMENTACION"
        real humidity_pct "SECADO"
        text drying_method "SECADO"
        real resting_days "REPOSO"
        real sca_score "CLASIFICACION"
        text defects "CLASIFICACION"
        real density "CLASIFICACION"
        text screen_size "CLASIFICACION"
        real fermentation_hours "FERMENTACION"
        text stage_hash
        timestamptz registered_at
    }
    QR_CERTIFICATE {
        uuid id PK
        uuid lot_id FK "unique"
        text code
        text sha256_hash "root of the per-stage hash chain"
        timestamptz issued_at
    }
    VERIFICATION {
        uuid id PK
        uuid qr_id FK
        timestamptz date
        text device
    }
    PAYMENT {
        uuid id PK
        uuid lot_id FK
        uuid cooperative_id FK
        real total_amount
        real commission_pct
        real producer_amount
        enum payment_status "PENDING|CONFIRMED|FAILED"
        text tx_hash
    }
    TIP {
        uuid id PK
        uuid lot_id FK
        uuid buyer_id FK "USERS"
        uuid producer_id FK "USERS"
        real amount
        text currency "MXN|USDC|MATIC"
        enum tip_status "REGISTERED|PENDING|CONFIRMED"
        text idempotency_key "UNIQUE"
        timestamptz created_at
        timestamptz updated_at
    }
    EVIDENCE {
        uuid id PK "= upload Idempotency-Key"
        uuid lote_id "no FK: uploaded before the lot exists"
        uuid finca_id FK "FARM"
        uuid uploader_id FK "USERS"
        text storage_key "path in the private bucket"
        char64 sha256
        text content_type "image/jpeg|png|webp"
        int size_bytes "<= 5242880"
        enum estado "PENDIENTE|ADJUNTA|ELIMINADA"
        timestamptz creado_en
        timestamptz adjuntada_en
    }
```

### Conceptual Entity-Relationship Diagram (Chen notation)

> A **teaching** version of the model (like the reference example): highlights *entities* (rectangle), *relationships* (diamond), and *cardinalities* (1:1, 1:N, N:M) **without** detailing columns. Its purpose is to validate the business logic (who relates to whom, and how many?) before landing on the physical model in the previous section.

```mermaid
flowchart LR
    USR[USER]
    PROD[PRODUCER]
    COOP[COOPERATIVE]
    BUY[BUYER]
    FARM[FARM]
    LOT[LOT]
    EVN[LOT_EVENTS]
    QR[QR_CERTIFICATE]
    VER[VERIFICATION]
    PAY[PAYMENT]
    TIP[TIP]

    R1{{OWNS 1:N}}
    R2{{AFFILIATED N:M}}
    R3{{SELLS_TO 1:N}}
    R4{{PRODUCES 1:N}}
    R5{{GENERATES 1:N}}
    R6{{ISSUES 1:1}}
    R7{{RECEIVES 1:N}}
    R8{{SETTLES 1:1}}
    R9{{TIPS 1:N}}

    USR ---|1:1| PROD
    USR ---|1:1| COOP
    USR ---|1:1| BUY
    PROD --- R1 --- FARM
    PROD --- R2 --- COOP
    COOP --- R3 --- BUY
    FARM --- R4 --- LOT
    LOT --- R5 --- EVN
    LOT --- R6 --- QR
    QR --- R7 --- VER
    LOT --- R8 --- PAY
    LOT --- R9 --- TIP
```

> **Reading the conceptual model:**
> - `USER → PRODUCER/COOPERATIVE/BUYER` are **1:1** relationships: a system account is exactly one of those three roles (the role lives in the `USERS.role` table).
> - `PRODUCER` **owns** many `FARM`s (1:N); each farm belongs to a single producer.
> - A `COOPERATIVE` **sells** its coffee to several `BUYER`s (**1:N**); `BUYER` carries `cooperative_id` as an FK.
> - `PRODUCER` is **affiliated** with several `COOPERATIVE`s and vice versa (**N:M**) → materialized via the bridge table `PRODUCER_COOPERATIVE`.
> - `FARM` **produces** many `LOT`s and each lot **generates** many `LOT_EVENTS` (1:N).
> - Each `LOT` **issues at most one** `QR_CERTIFICATE` and **settles at most one** `PAYMENT` (1:1 "optional": 0 or 1) — matches the ERD.
> - `LOT_EVENTS`, `QR_CERTIFICATE`, `VERIFICATION`, and `PAYMENT` are **weak entities**: they only make sense tied to their lot/origin.

> **From conceptual to physical (the `erDiagram` above):** 1:1/1:N relationships are resolved with an **FK** on the "N" side entity; N:M relationships require a **bridge table** (`PRODUCER_COOPERATIVE`). This step is also documented in `docs/02-data-model.md` (Issue 2).

### Data flow diagram (DFD) — where each piece of data comes from

> The ERD shows *what* exists; this diagram shows *where each piece of data travels from* on its way to the database, and *who consumes it*. Before storing data you need to know who creates it and who uses it.

```mermaid
flowchart LR
    subgraph Sources["⚙️ Data sources"]
        A1[Producer at the farm] -->|weight, date, altitude| A
        A2[Dry mill] -->|loss, green weight| A
        A3[Roaster] -->|roasting, lot| A
        A4[Phone camera] -->|JPEG photo + sha256| A
    end

    subgraph Storage [🗄️ Data layer]
        A[FastAPI API]
        A --> LOT[LOTS]
        A --> EVEN[LOT_EVENTS]
        A --> QR[QR_CERTIFICATE]
        A --> PAY[PAYMENTS]
        A --> TIP[TIPS]
        A --> EVID[EVIDENCE]
        A --> STOR[(Private Storage)]
    end

    subgraph Consumers [🔎 Consumers]
        B1[Cooperative - dashboard] --> LOT
        B2[Consumer - scans QR] --> QR
        B3[Buyer - tip] --> TIP
        B4[Polygon - confirms payment] --> PAY
        B5[Phone - signed URL] --> STOR
    end

    style A fill:#bbdefb
```

> **Evidence (ADR-14).** The phone **never** writes to Postgres or Storage: it uploads the binary to `POST /v1/evidencias` (multipart) and FastAPI stores it in the **private** bucket `evidencias-lotes` with `service_role`, creating the `EVIDENCE` row in `PENDIENTE` state. When the lot is created with `evidencia_id`, the backend copies `evidencia_url`/`evidencia_sha256` **from the row** (not from the request body) and marks it `ADJUNTA`. Reads use a short-lived signed URL (`GET /v1/lotes/{lote_id}/evidencia`).

### Domain diagram (Class) — who owns each piece of data

> The **domain class diagram** is the one in §4 (single source of truth). This section only shows how it maps to the database tables.

| Class (domain §4) | Table(s) | Mapping |
|---|---|---|
| `Lot` | `LOT` | 1 row = 1 lot (denormalized state + variety + evidence) |
| `LotEvent` | `LOT_EVENTS` | 1 event = 1 transition/sub-stage (append-only, `stage_hash`) |
| `QRCertificate` | `QR_CERTIFICATE` | issued when reaching `TOSTADO` (0–1 per lot); `sha256_hash` = root of the chain |
| `Payment` | `PAYMENT` | created on sale (0–1 per lot) |
| `Tip` | `TIP` | 0–N per lot; bivalente off-chain/on-chain |
| `Farm` / `Producer` | `FARM` / `PRODUCER` | lot's origin context |
| `SupabaseLotRepo` | infrastructure | reads/writes the tables above |
| `LotService`, `StateMachine` | services (no tables) | business rules |

> **Per-stage hash (linear chain).** Each `LOT_EVENTS.stage_hash` is computed as `HASH(previous_stage.hash ‖ event_data)` in order `(registered_at, id)`. The last hash of the chain **is the root** stored in `QR_CERTIFICATE.sha256_hash`. If an event is edited, the root no longer matches → 409 (see §8 and ADR-11).

> Cardinality rules are aligned between §4 and this ERD: a lot **has at most one** QR and **one** payment, because certification (`TOSTADO`) and sale (`VENDIDO`) each only happen once, terminally.

### Why do we store each piece of data? (Business question → Data)

> We don't store anything "just because." Every field answers a concrete business question or a regulatory requirement from the project's technical memory.

| Business question | Data we store | Table |
|---|---|---|
| Who grew this lot? | `producers.*`, `farms.*` | PRODUCER / FARM |
| Where did it grow? (certify origin) | `municipality`, `min_altitude/max_altitude`, `organic` | FARM |
| What variety is it? | `variety` | LOT |
| How much coffee was registered? | `harvest_date`, `weight_kg` | LOT |
| How was it processed? | `processing_method` (washed/semilavado/honey/natural) | LOT / LOT_EVENTS |
| What stage is it in? | `state` → `LOT` (denorm) | LOT |
| What was its history? (traceability) | `LOT_EVENTS` record with from/to state + sub-stages | LOT_EVENTS |
| Was weight lost in each process? | `loss_pct` | LOT_EVENTS |
| How long did it ferment / dry / rest? | `fermentation_hours`, `humidity_pct`, `resting_days` | LOT_EVENTS |
| What is its cupping score? | `sca_score`, `defects`, `density`, `screen_size` | LOT_EVENTS |
| Does the photographic evidence exist? | `evidence_url` + `evidence_sha256` | LOT |
| Is the chain intact? | `stage_hash` per event; root in `sha256_hash` | LOT_EVENTS / QR_CERTIFICATE |
| Is all the information immutable? | `registered_at` + INSERT only | LOT_EVENTS |
| Who performed each transition? | `actor_id` → `USERS` | LOT_EVENTS / USERS |
| Who scanned the QR? | `VERIFICATION` (date, device) | VERIFICATION |
| How much is paid to the producer? | `total_amount`, `producer_amount`, `commission_pct` | PAYMENT |
| Who bought the lot? | `buyer_id` in the `SALE` event | LOT_EVENTS |
| Did the payment land on-chain? | `tx_hash`, `payment_status` | PAYMENT |
| Did the buyer leave a tip? | `amount`, `currency`, `tip_status`, `idempotency_key` | TIP |
| Is it a person/org with credentials? | `email`, `role`, `public_address` (wallet) | USERS (wallet pending, B11) |
| Is the QR authentic? | `sha256_hash` (root of the per-stage hash chain) | QR_CERTIFICATE |

---

### PostgreSQL best practices (applied from day one)

- **ENUM** for `state` and `type` (not loose VARCHAR) → prevents invalid states in the DB.
- **`TIMESTAMPTZ`** on every date (UTC): never a timezone-less `TIMESTAMP`.
- **CHECK constraints**: `loss_pct >= 0`, `weight_kg > 0`, `commission_pct BETWEEN 0 AND 100` → integrity is also validated at the DB level, not just in the API.
- **UUID** as PK (generated on the client) → supports offline-generated ids without collisions; the server never assumes the id arrives "empty".
- **`lot_events` is immutable**: no UPDATE/DELETE, INSERT only.
- Composite index to query history in order:
  `CREATE INDEX idx_lot_events_lot_time ON lot_events (lot_id, registered_at DESC);`
- **RLS**: policies are anchored to `auth.uid()` → `USERS` (role + linked entity), never to a client-supplied ID.

---

## 6. API contract (FastAPI) — per-endpoint detail

> The backend is the only gate that knows the **coffee business rules**: it validates the state machine, generates the QR, and dispatches payments. The app only requests and hands over data; it **never** writes directly to the database.

### Backend layers (responsibility logic)

```
┌───────────────────────────────────────────────────────────┐
│ 1. Presentation layer (routers)                             │
│    - Exposes REST endpoints (/lotes, /eventos, ...)         │
│    - Receives the request and returns the response as DTO  │
│    - Doesn't know how an event is processed                │
├───────────────────────────────────────────────────────────┤
│ 2. Application layer (orchestration services)               │
│    "Services": decide WHAT to do                           │
│    - state_machine: is this transition valid?               │
│    - lots_service: coordinates create/event/query           │
│    - qr_service: builds and signs the QR certificate        │
│    - payments: orchestrates the on-chain payment (3%/97%)   │
│    Is the only layer that KNOWS the business rules          │
├───────────────────────────────────────────────────────────┤
│ 3. Data access layer (repository)                              │
│    - Translates requests into Supabase queries              │
│    - lot_events: INSERT ONLY (append-only)                 │
│    - lots: UPDATE of the current state (denorm)              │
├───────────────────────────────────────────────────────────┤
│ 4. Infrastructure layer                                        │
│    - Supabase client (pool)                                  │
│    - Web3 client (Polygon node)  → signs and sends tx        │
│    - Secrets in environment variables (never in code)       │
└───────────────────────────────────────────────────────────┘
```

### Rules that guarantee the separation

- A layer **cannot** skip inward (a router doesn't write SQL). Doing so breaks the immutability of traceability.
- Services concentrate the **"what"**; infrastructure the **"how"**. Swapping the DB or network doesn't affect the state rules.
- Responses always use an output DTO (no internal fields or keys exposed).

### Entry points (endpoints)

**Scope notes:**
- **Weather/Status of the Day** is a **decorative** dashboard widget: computed on the client from already available data; **it has no dedicated endpoint** (ADR-13).
- **Market** is a **read-only projection** (`GET`): materialized by the backend; the app never writes to it (ADR-9).
- **Photographic evidence** (ADR-14): `POST /v1/evidencias` uploads the binary to the private bucket (multipart) and returns its `id` (= `Idempotency-Key`); the lot references it via `evidencia_id` and the backend copies `evidencia_url` + `evidencia_sha256` **from the row**, never from the body. `GET /v1/lotes/{lote_id}/evidencia` signs a 600 s URL. The phone never talks to Storage or Postgres.
- The sale (`POST /v1/pagos`) and history (`GET /v1/pagos`) belong to the **cooperative**; the balance (`GET /v1/pagos/saldo`) belongs to the **producer** (or admin), consistent with the §10 matrix where `pago` is the producer's read over their lots; the tip is written by the **buyer** (`POST /v1/propinas`) and read by the **lot owners** (producer, cooperative, buyer of the sale) and admin (`GET /v1/propinas/lote/{lote_id}`); `GET /v1/auth/me` resolves the real role from `USUARIOS` via `auth.uid()`.

**API design (REST best practices applied with the FastAPI skill):**

| Method | Route | What it does | Idempotency | Codes |
|---|---|---|---|---|
| `POST` | `/v1/auth/login` | Login (Supabase JWT) | No | `200` · `401` |
| `POST` | `/v1/auth/register` | Public sign-up: always creates a `productor` (rejects privileged roles) | No | `200` · `422` |
| `POST` | `/v1/auth/refresh` | Refresh token | No | `200` · `401` |
| `POST` | `/v1/auth/recover` | Request password recovery (uniform response, no account enumeration) | No | `200` |
| `POST` | `/v1/auth/recover/confirm` | Set the new password with a one-time token | No | `200` · `401` · `422` |
| `GET` | `/v1/auth/me` | Authenticated user profile (resolves the real role via `auth.uid()`) | Yes | `200` |
| `GET` | `/v1/cooperativas` | List cooperatives (admin) | Yes | `200` · `403` |
| `GET` | `/v1/compradores` | Buyer directory (cooperative/admin, to choose `comprador_id` on sale) | Yes | `200` · `403` |
| `GET` | `/v1/fincas` | Authenticated user's farms (resolves `finca_id` for lot creation) | Yes | `200` · `403` |
| `POST` | `/v1/fincas` | Producer's first farm (onboarding, mobile `id` = idempotency) | body `id` | `201` · `403` · `409` · `422` |
| `POST` | `/v1/evidencias` | Upload private photo to the bucket (multipart: `finca_id`, `lote_id`, `archivo`) | `Idempotency-Key` | `201` · `403` · `422` |
| `POST` | `/v1/lotes` | Create a lot in CEREZA state (variety, method, weight, `evidencia_id`) | No (returns id) | `201` · `400` · `403` · `422` |
| `POST` | `/v1/lotes/{lote_id}/eventos` | Register a transition/sub-stage (11 types) | `Idempotency-Key` | `201` · `409` · `422` |
| `GET` | `/v1/lotes/{lote_id}` | Query lot + history | Yes | `200` · `404` |
| `GET` | `/v1/lotes/{lote_id}/evidencia` | Temporary signed URL of the attached evidence | Yes | `200` · `403` · `404` |
| `GET` | `/v1/lotes` | List lots (cursor-paginated) | Yes | `200` · `400` |
| `GET` | `/v1/verificar/{codigo}` | **Coffee Passport** public verification (no auth) | Yes | `200` · `404` · `409` |
| `GET` | `/v1/mercado/{lote_id}` | **Fair Trade Panel**: read-only 97/3 projection + tips (ADR-9) | Yes | `200` · `403` · `404` |
| `POST` | `/v1/pagos` | Sale + on-chain payment trigger 3%/97% | `Idempotency-Key` | `202` · `409` · `422` |
| `GET` | `/v1/pagos` | Cooperative payment history (cursor) | Yes | `200` · `403` |
| `GET` | `/v1/pagos/saldo` | Producer balance (97% of confirmed sales + tips) | Yes | `200` · `403` |
| `POST` | `/v1/propinas` | Register buyer tip (idempotent, bivalent) | `Idempotency-Key` | `201` · `409` · `422` |
| `GET` | `/v1/propinas/lote/{lote_id}` | List a lot's tips (tenant read: lot owners + admin) | Yes | `200` · `403` · `404` |
| `POST` | `/v1/sync` | Batch of offline operations (producer/cooperative/admin) | Yes (reuses ids) | `202` · `207` |
| `GET` | `/health` | Health check (outside `/v1`) | Yes | `200` |

**Applied rules:**
- Resources in plural (`/lotes`, `/eventos`); nesting only for real hierarchies (`/lotes/{lote_id}/eventos`).
- Transitions and payments are **actions** → `POST`, not a `PUT` on state; `Idempotency-Key` is used so an offline retry doesn't duplicate the event.
- No `DELETE` in traceability: physically it's "cancelled" via the `RECHAZADO` state (history is kept).
- URL versioning (`/v1/`): field phones don't update the same day; the old API version must keep working.
- Cursor pagination (`?cursor=..&limit=..`) instead of `OFFSET` (avoids slow scans on large tables).
- 2xx codes with correct semantics: `200` (read), `201` (created), `202` (async on-chain payment), `207` (multi-status in sync).

### Flow of a transition (sequence diagram)

```mermaid
sequenceDiagram
    autonumber
    actor P as Producer (mobile)
    participant API as Backend FastAPI
    participant DB as Supabase (Postgres)
    participant SC as CoffeePayments (Polygon)

    P->>API: POST /v1/lotes/{lote_id}/eventos (CEREZA→PERGAMINO)
    API->>DB: Validate JWT + current lot state
    DB-->>API: state OK (CEREZA)
    alt Transition allowed
        API->>DB: INSERT lot_events (append-only)
        API->>DB: UPDATE lots (state → PERGAMINO)
        API-->>P: 201 Created
    else Invalid transition
        API-->>P: 409 State not allowed
    end
```

> The app **never** writes directly to the DB: everything goes through FastAPI, which validates the JWT and the state machine. In offline mode the app stores changes in its local SQLite and syncs later (see §7).

### Input/output validation (Pydantic)

- Every `body` goes through Pydantic models: strong types, bounds (`Field(gt=0)`), and state enums.
- Every response uses a `response_model` / return type so internal fields aren't exposed (e.g. private keys).
- Business errors: HTTP 422 (validation) or 409 (invalid state), messages in English.

---

## 7. Mobile application (React Native / Expo) — logic

> The app is the **producer's face in the field**: registering harvests in 3 taps, seeing each lot's state, and generating its QR. It's designed to be used under the sun and without a connection.
> Best practices applied from the official skills: **vercel-react-native-skills** (performance metrics, navigation, UI) and **react-native-best-practices** (performance, profiling).

### 7.1 App responsibilities (logic)

| Responsibility | What it does | Where it lives |
|---|---|---|
| Register harvest/events | Field capture, on-device validation | Screens + forms |
| Capture evidence | Camera/gallery, normalize to JPEG and compute SHA-256 | `src/evidencia/` + wizard |
| Offline logic | Writes to local SQLite first, queues, and syncs | `db` + `sync` sublayers |
| View a lot's history | Shows the state machine visually | Detail screen |
| Scan / show QR | Generation and verification with the consumer | QR screen |
| Authentication | Login/refresh with Supabase Auth (JWT) | Auth sublayer |

### 7.2 Internal app layers (no code)

```
┌───────────────────────────────────────────────┐
│ Screens (expo-router, 4 tabs + stacks)        │
│   Harvest (tab): lots/ (list) + stack         │
│   Dashboard (tab): My Farm (bento grid)       │
│   Traceability (tab): my lots history         │
│     (the public scanner lives in verify/)     │
│   Market (tab): offers + market/[lotId]       │
│   Settings (tab): profile, sync, session      │
│   PUBLIC group verify/: index (scanner)       │
│     + [code] (Coffee Passport, no auth)       │
├───────────────────────────────────────────────┤
│ UI State (Zustand / Jotai)                    │
│   - lotStore (cached current lot state)       │
│   - syncStore (counter, pending, errors)      │
│   - offlineStore (cached reads + alert)       │
├───────────────────────────────────────────────┤
│ Local repository (SQLite)                     │
│   - reads ALWAYS from local (cache)           │
│   - pending operations queue (sync_queue)     │
│   - `attachments`: photos on disk + metadata  │
├───────────────────────────────────────────────┤
│ Evidence capture (`src/evidencia/`)           │
│   - camera/gallery → JPEG 2048px q0.82        │
│   - persists outside cache + SHA-256          │
├───────────────────────────────────────────────┤
│ Network client (HTTP to FastAPI)              │
│   - sends operations online or in batch       │
│   - authenticates with Supabase JWT           │
└───────────────────────────────────────────────┘
```

### 7.3 Navigation and screen flow

- **Native navigation** (expo-router with native stack/tabs) per the Vercel skill (avoid JS navigators for performance and platform behavior).
- **4 authenticated tabs**: **Harvest** (registration + detail), **Dashboard My Farm** (bento summary), **Market** (offers/projection), **Settings** (profile and sync).
- **Per-tab stack**:
  - `lots/` (list) → `lots/new` (**3-step wizard**: 1) variety + method → 2) weight → 3) photo evidence) → `lots/[id]` (detail with **per-stage hash timeline**).
  - `market/` → `market/[lotId]` (**Fair Trade Panel**: donut 97/3 + tip).
- **PUBLIC group `verify/` outside auth**: `verify/` (scanner) → `verify/[code]` (Coffee Passport). The end consumer does not log in.
- **Dashboard My Farm** (tab): **bento** layout with cards (active lots, balance, decorative Status of the Day) + **persistent offline alert** when no connection + **FAB** floating button that leads to the `lots/new` wizard.

```mermaid
flowchart LR
    subgraph AUTH["🔐 Authenticated (4 tabs)"]
        T1[Harvest] --> W[New lot wizard<br/>1 variety+method → 2 weight → 3 evidence]
        T1 --> D[Lot detail [id]<br/>per-stage hash timeline]
        T2[Dashboard My Farm<br/>bento + offline alert + FAB]
        T3[Market] --> P[Fair Trade Panel<br/>donut 97/3 + tip]
        T4[Settings]
    end
    subgraph PUB["🌐 Public (no auth)"]
        S[verify/ scanner] --> PAS[verify/[code]<br/>Coffee Passport]
    end
    Login --> AUTH
    T1 --> Login
    S --> PAS
```

**"Copa de cata" palette** (visual identity): espresso `#3A1D0C` (backgrounds/strong accents), cream `#8A5A00` (CTAs and accents), cherry `#8A2E3D` (alerts and highlights), surface `#F7EBDD` (light backgrounds and cards).

### 7.4 Performance and field experience (official skills)

- **Lists** of lots/history: virtualized list (FlashList), never `ScrollView` with `map` — field phones are cheap and memory-constrained.
- **Re-renders**: atomic state with selectors (Zustand) instead of one giant global context.
- **Field UI**: large controls, high contrast, single-button save; clear icons (memory note: varied digital literacy).
- **Profile before optimizing**: measure (react-devtools/profilers), optimize, re-measure — avoid blind memoization.

### 7.5 Offline-first module (mobile ↔ backend)

> Real problem: there's no connectivity in the mountains. The app must work **without internet** and sync afterward.
> This is part of the app's `db` + `sync` layer (see §7.2).

```
Mobile App (Expo)
   ● Is there a connection?  (NetInfo)
   ├── yes ──► local SQLite as read cache + sends operations
   │           and marks them as "synced"
   └── no ──► local SQLite: stores events and queues the operation
              in sync_queue

On reconnect (NetInfo / retry with backoff) -->
   POST /v1/sync  (batch of pending operations)
   the backend processes them and responds with a result per operation
   the app marks each one as 'ok' or 'conflict' (LWW)
```

> **"Queue first" flow (same online/offline).** The app does not try to upload
> immediately: it queues the operation in SQLite (optimistic projection with
> `pendiente: true`) and the engine runs it in FIFO order. For a harvest with a
> photo, the queue holds `subir_evidencia` first (to `POST /v1/evidencias`) and
> then `registrar_cosecha` (to `/v1/sync`), so the lot never references a photo
> that does not exist yet. The engine is *single-flight*: there are never two
> concurrent flushes.

#### Key design decisions (offline)

| Decision | Rule |
|---|---|
| Ids | UUIDs generated **on the phone** (avoids primary key conflicts) |
| Local queue | `sync_queue` table (typed operation + payload + status) |
| Evidence | `attachments` table (photo persisted outside cache): the engine uploads the photo (`subir_evidencia`) **before** creating the lot, keeps the file until the lot references it and deletes it on confirmation; discarding drags the lot+photo pair |
| Reads | Always from local SQLite → the UI never "freezes" |
| Retries | Exponential backoff + notification on reconnect |
| Conflicts | LWW (*last-write-wins*) by `updated_at` |
| Integrity | The server's `lot_events` is ALWAYS the source of truth |

#### Sync sequence

```mermaid
sequenceDiagram
    autonumber
    actor U as Producer (mobile)
    participant App as React Native App
    participant SQLite as Local SQLite
    participant API as Backend /v1/sync
    participant DB as Supabase

    U->>App: Registers event (no signal)
    App->>SQLite: saves locally + queues (pending)
    Note over App: NetInfo detects connection
    App->>API: POST /v1/sync (batch of ops with UUID)
    API->>DB: validates + inserts (append-only)
    DB-->>API: ok per operation
    API-->>App: 202/207 {op_id: ok|error}
    App->>SQLite: marks each op as ok/conflict
```

---

## 8. Coffee Passport (public QR verification)

> This whole system converges on a single artifact for the consumer: the **Coffee Passport** (evolution of the Certificate of Origin) issued via a QR code. "Verifying the coffee" means confirming that the declared origin and processes really happened.

- The QR encodes the lot's `code` + `sha256_hash` root (it doesn't expose the full history in the QR itself; the API supplies that on validation).
- The passport displays **rich traceability data**: producer, farm (municipality + altitude), **variety**, **processing method**, harvest date, **final humidity**, **SCA score**, current state and process history as a **per-stage hash timeline** (CEREZA → PERGAMINO → ORO → TOSTADO, including sub-stages).
- On scan → `GET /v1/verificar/{codigo}` (no authentication).
- Responses:
  - **Valid**: the Coffee Passport with lot data + event timeline with its `stage_hash`.
  - **Not found** → HTTP 404.
  - **Invalid/tampered** → HTTP 409.
- **Integrity is cut at `issued_at`**: events after the certificate was issued **do not** form part of the canonical verified hash (the passport is a snapshot of the lot at issuance). The per-stage hash also enables on-chain anchoring (§9, ADR-11).

### Verification flow (sequence diagram)

```mermaid
sequenceDiagram
    autonumber
    actor C as Consumer (mobile/camera)
    participant API as Backend FastAPI
    participant DB as Supabase

    C->>C: Scans QR (code + hash in the code)
    C->>API: GET /v1/verificar/{codigo} (no auth)
    API->>DB: SELECT qr_certificate WHERE code=?
    alt Not found
        API-->>C: 404 Code not found
    end
    API->>DB: SELECT lots + lot_events (timeline, up to issued_at)
    API->>API: Recalculates per-stage hash chain from real history
    alt hash matches certificate root
        API->>DB: INSERT verification (audit query)
        API-->>C: 200 Coffee Passport (variety, method, altitude, humidity, SCA, timeline with per-stage hash)
    else hash doesn't match (tampered)
        API-->>C: 409 Invalid / tampered passport
    end
```

### Mobile scan → Coffee Passport (public group, no auth)

```mermaid
sequenceDiagram
    autonumber
    actor Con as Consumer
    participant App as RN App (PUBLIC group verify/)
    participant API as Backend FastAPI
    participant DB as Supabase

    Con->>App: Opens verify/ (no login)
    App->>App: Camera scans QR (code + hash)
    App->>API: GET /v1/verificar/{codigo}
    API->>DB: SELECT qr_certificate WHERE code=?
    alt Not found
        API-->>App: 404
        App-->>Con: "Code not found"
    else Exists
        API->>DB: SELECT lots + lot_events (up to issued_at)
        API->>API: Recalculates per-stage hash chain
        alt root matches
            API-->>App: 200 Coffee Passport (variety, method, altitude, humidity, SCA, timeline)
            App-->>Con: Renders passport with per-stage hash
        else root differs (tampered)
            API-->>App: 409
            App-->>Con: Tampered passport alert
        end
    end
```

---

## 9. Blockchain and payments (Solidity / Polygon)

> **v1 MVP status**: the on-chain flow is **designed** here and in `docs/06-contratos.md`, but the web3 integration is **paused** (debt B7: the backend wallet and a deployed contract are missing). The real Supabase project is already connected (auth + data + Storage) and the MVP runs `FakeGatewayPagos` (deterministic tx `0x<payment.id>` and simulated confirmation) which already implements the 3%/97% pattern and the `PENDING → CONFIRMED` poller. The producer's wallet (`public_address` in `USUARIOS`) will be persisted when web3 resumes.

### Responsibility of the `CoffeePayments.sol` Smart Contract

Sole responsibility: payment and transaction immutability (*single responsibility*).
- Receives the sale (`lot_id`, `producer`, `quantity` → `weight_kg` from the `VENTA` event, `price` → `total_amount`) **signed by the backend**.
- Withholds the **3% commission** to the cooperative's treasury.
- Automatically sends **97%** to the producer's wallet (*pull-over-push* pattern).
- Emits on-chain events (`PaymentPaid(lotId, producerAddr, amount)`) for auditing.
- Also records **tips to the producer** (ADR-10): buyer → producer, 100% direct, idempotent, issued after the sale.

### Fair Trade Panel (read-only projection)

The **Fair Trade Panel** is a read-only view of the lot's payment breakdown: **97% to the producer, 3% to the cooperative's operation**. It is rendered from the backend (`GET /v1/pagos`, `GET /v1/pagos/saldo`) and optionally supplemented with **tips** (`POST /v1/propinas`, `GET /v1/propinas/lote/{lote_id}`). The panel never writes directly to the contract; all mutations go through the backend (ADR-9).

### Per-stage hash anchoring (ADR-11)

Instead of anchoring a single hash per lot, the backend can call `anchorHash(lotId, stageRootHash)` for each stage (or in batch). The root of the per-stage hash chain is stored in the `HashAnchored` event, allowing auditors to verify the lot's history at any point. This is optional and does not block offline verification (see §8).

### Best practices from the Solidity skill

- Solidity `0.8.x` (compiler-level overflow/underflow protection).
- SafeERC20 + `ReentrancyGuard` (OpenZeppelin).
- *Checks-effects-interactions* pattern.
- Custom errors (cheaper in gas) instead of `require("message")`.
- The **backend's private key is NEVER in the code**: it's stored as an environment secret (Supabase secrets / `.env`, which is in `.gitignore`).

### Network and deployment

- **Testnet**: Polygon `Amoy` (current Polygon testnet and compatible networks).
- Deploy from `contracts/script/` with **Foundry** (`forge script ... --rpc-url ...`).
- Test funds: Amoy faucet (free test MATIC).
- Mainnet is evaluated for production; Polygon (L2) keeps gas low because it inherits Ethereum's security.

### Backend payment flow (sequence diagram)

```mermaid
sequenceDiagram
    autonumber
    participant B as Backend FastAPI
    participant SC as CoffeePayments (Polygon)
    participant DB as Supabase (payments)

    B->>B: Receives sale (lot, price, producer, buyer)
    B->>B: Calculates 3% commission and 97% net
    B->>B: Signs the sale message (backend wallet)
    B->>SC: coffeePayments.pay(signed_sale)
    SC-->>B: tx_hash sent
    B->>DB: saves tx_hash + payment_status=PENDING
    DB-->>B: ok
    Note over B,SC: Async confirmation (202): the tx confirms in later blocks. State → CONFIRMED via a contract event.
    B-->>B: notifies the producer (automatic payment)
```

> If the producer doesn't have a wallet yet, one is assigned/generated at registration: their `public_address` lives in the **`USERS`** table (single source of truth for the wallet). In the field (offline) the address can be created locally and validated on sync.
> The payment is triggered from the **cooperative's** account (author of the sale); the contract sends 97% to the producer's wallet and withholds 3% to the cooperative's treasury.

---

## 10. Roles and permissions (Supabase RLS + JWT)

Roles are modeled in the **`USERS.role`** table (`producer | cooperative | buyer | admin`). The end consumer **has no account** in the system: they verify via the public `/v1/verificar/{codigo}` endpoint (no token).

| Role | Read | Write | Has an account? |
|---|---|---|---|
| **producer** | Their farms, their lots and their balance (`/pagos/saldo`) | Events on their lots | Yes |
| **cooperative** | All lots from their farms | Manage lots, producers, payments | Yes |
| **buyer** | Verifiable lots (public QR) **+ fair trade/tips** | Tips on sold lots | Yes |
| **consumer** | Only public QR `/v1/verificar/{codigo}` | — | No |
| **admin** | Everything | Configuration, cooperatives, lots/events (incl. `/v1/sync`) | Yes |

- **Authentication**: Supabase Auth (email/password, or *magic link* for producers without email). Supabase's `auth.uid()` **is** `USERS.id` (same UUID linked at registration).
- **Authorization**: PostgreSQL RLS — policies resolve the role from `USERS` and restrict by ownership (`PRODUCER` of the farm, `COOPERATIVE` of the farm, `BUYER` of the tip) **without trusting client-supplied IDs**; additionally the `get_current_user` dependency in FastAPI enforces the same check at the API level.

**Real state (MVP):**
- **Per-user effective RLS (B11 advances).** Authenticated endpoints build their repositories with a Supabase client carrying the user's JWT (`get_supabase_user_client`: anon key + `Authorization: Bearer <jwt>`, no `auth.set_session`), so Postgres evaluates the policies for real. `AuthenticatedRequest` is the **only** dependency that validates the JWT. `service_role` is reserved for system tasks: internal auth (login/refresh/profile) and public verification (`LoteServiceDep` vs `PublicLoteServiceDep`). The service layer keeps its tenancy check as defense in depth (e.g. `PropinaService.listar_propinas_lote`).
- The policies live in `Backend/db/migrations/006_hardening_storage_rls_rate_limit.sql`: they recreate **all** rules on top of `app_private.bean_rol()` (security definer, fixed `search_path`) and revoke direct `anon`/`authenticated` grants, keeping only the necessary ones.
- **Private photographic evidence** (ADR-14) implemented: `POST /v1/evidencias` validates MIME + *magic bytes* + size (5 MB), computes SHA-256, uploads to the **private** bucket `evidencias-lotes` with `service_role` and creates the `PENDIENTE` row; lot creation (`evidencia_id`) copies `evidencia_url`/`evidencia_sha256` from the row and marks it `ADJUNTA`. `GET /v1/lotes/{lote_id}/evidencia` returns a signed URL (~10 min). The `public.evidencias` table (migration 006) has no grants to `anon`/`authenticated`: only the backend administers it.
- **Atomic creation with a photo (migration 008/009).** `public.registrar_cosecha_con_evidencia(...)` is a `security definer` RPC executable only by `authenticated`: in one transaction it locks the `PENDIENTE` evidence, re-checks tenancy (`auth.uid()` + farm + uploader + lot), creates the lot and the genesis event, and marks the evidence `ADJUNTA`. Migration 009 fixes its idempotency: a retry is recognized by stable fields (not by the hash, which includes `registrado_en`). Hashed physical fields move to `double precision` so the chain is reproducible; the historical repair is audited in `app_private.reparacion_cadena_evento` (log with no user grants).
- **Shared rate limit**: `InMemoryRateLimitRepo` (dev/CI) or `SupabaseRateLimitRepo` (RPC `bean_consume_rate_limit` over `app_private.rate_limit_bucket`); `limitar_login` signs an HMAC-SHA256 of `ip|route` and applies it on `/login`, `/register`, `/refresh`, `/recover` and `/recover/confirm`.
- **Rotating refresh (local provider)**: every refresh carries `jti` + `family`; reusing a consumed `jti` revokes the family, and `restablecer_password` revokes the user's sessions. In production Supabase Auth remains the one that rotates.

### RLS permission matrix (per table)

| Table | producer | cooperative | buyer | admin |
|---|---|---|---|---|
| `usuarios` | own (read) | own (read) | own (read) | all |
| `cooperativa` | — | — | — | read |
| `finca` | own (read + initial create) | own + their producers' (read) | — | all |
| `lotes` | their farms' | their farms' | — (only `/verificar`) | all |
| `lote_eventos` | their lots' (append-only) | their lots' (append-only) | — | all |
| `qr_certificado` | their lots' | their lots' | — | all |
| `pago` | their lots' (read) | own (write) | read (lot's fair trade) | all |
| `propina` | their lots' (read) | their lots' (read) | own (write) + read | all |
| `verificacion` | their lots' | their lots' | — | all |
| `evidencias` | — | — | — | — (backend only with `service_role`; no grants to `anon`/`authenticated`) |
| `storage.objects` | — | — | — | — (RLS enabled **without policies** for `anon`/`authenticated`; only `service_role` uploads/signs/deletes in the private `evidencias-lotes` bucket) |

**Tenant isolation:** every RLS policy is resolved **always** from `auth.uid()` → `USERS.id` of the JWT (never from a client-supplied ID), through `app_private.bean_rol()` (security definer). The `PROPINA` policy is **its own**: insert only if the JWT matches `comprador_id`, and read only if the user is `comprador_id`, `productor_id`, the lot's cooperative, or admin.

The matrix is implemented in `Backend/db/migrations/002_rls.sql` and **recreated** by `006_hardening_storage_rls_rate_limit.sql` (which also moves the helper to `app_private`, adjusts grants and protects `storage.objects`); `014_registro_productor_y_finca.sql` hardens public sign-up (always `productor`), restricts `finca_insert` to the pilot cooperative, and blocks changes to `productor_id`/`cooperativa_id` via trigger; it is the same rule the service layer replicates in FastAPI (double control, §12).

---

## 11. Architecture decisions (ADR) already made

1. **`backend = FastAPI + Supabase`**: the coffee state rules justify a dedicated API (consistent with the technical memory) and Supabase provides persistence with less custom infrastructure.
2. **Lightweight event-sourcing** (`lots` + `lot_events`): separating state from its history for real immutability.
3. **UUIDs generated on the phone**: an offline-first requirement, no central-collision risk.
4. **QR with hash (no fragile state in the DB)**: fast and verifiable for the consumer.
5. **Contract separated from the backend**: payment immutability and independent auditability.
6. **`USERS` as the central identity table**: credentials and wallet live in `USERS`; `PRODUCER`/`COOPERATIVE`/`BUYER` only add the business role (RLS anchors to `USERS`, not to the specific entity).
7. **Web3 paused in MVP** (B7): the `CoffeePayments.sol` contract is specified in `docs/06-contratos.md` but not implemented in this milestone; the MVP uses `FakeGatewayPagos`. Avoids debt: the interface and idempotency (`idempotency_key UNIQUE`) are already resolved.
8. **Money as `real`/`float` with CHECK** per ERD; migrating to `NUMERIC`/`Decimal` is a documented future improvement (does not block MVP).

Each decision is documented in this same section (ADR 1–8) with template: Title · Context · Decision · Consequences.

Below, ADRs 9–14 in the standard format **Context → Decision → Options Considered → Consequences** (consistent with ADRs 1–8):

### ADR-9 — Market as a read-only projection

- **Context:** the app and passport need to show offers/fair trade of the coffee; writing that view from the mobile would break the source of truth and tenant isolation.
- **Decision:** the market is a **read-only projection** materialized by the backend (from `LOT`, `PAYMENT`, `TIP`); there is no `POST /mercado`.
- **Options considered:** (a) direct write from mobile to market — rejected: breaks RLS; (b) materialized SQL view with refresh — rejected: complexity in MVP; (c) **projection calculated in the service** — chosen.
- **Consequences:** offer and Fair Trade Panel views are always consistent; no role writes the market; minimal latency since it's a simple calculation.

### ADR-10 — Tip to the producer (100% direct, idempotent, bivalent)

- **Context:** the buyer wants to recognize the producer's work beyond the sale; the 3% sale commission must not apply to the tip.
- **Decision:** `TIP` table with `idempotency_key UNIQUE`; the amount goes **100%** to the producer; `tip_status` (`REGISTERED → PENDING → CONFIRMED`) is **bivalent off-chain/on-chain** (same as `PAYMENT`).
- **Options considered:** (a) tip inside `PAYMENT` — rejected: mixes commission; (b) tip only on-chain — rejected: web3 paused (B7); (c) **dedicated bivalent table** — chosen.
- **Consequences:** the producer receives 100%; idempotency prevents double sends; when web3 resumes, the tip settles with the same signing mechanism.

### ADR-11 — Per-stage hash (linear chain + on-chain root anchor)

- **Context:** the passport shows the full history; a single hash does not prove that *each stage* was not tampered with.
- **Decision:** each `LOT_EVENTS` carries a `stage_hash` in a **linear chain** (`hash_i = HASH(hash_{i-1} ‖ data)` ordered by `registered_at, id`); the root is `QR_CERTIFICATE.sha256_hash`, verifiable with the QR and anchorable on-chain **reusing `anchorHash()`**.
- **Options considered:** (a) single lot hash — rejected: doesn't isolate the tampered stage; (b) Merkle tree — rejected for MVP complexity; (c) **linear chain** — chosen for simplicity and sufficient for the use case.
- **Consequences:** verification cuts at `issued_at`; editing any event breaks the root → 409; per-stage anchoring optional when web3 resumes (B7).

### ADR-12 — Expanded coffee process (full chain with auto-transitions)

- **Context:** the technical memory describes sub-stages (fermentation, washing, drying, resting, grading) that did not exist in the original 4-state machine.
- **Decision:** the **milestones** `CEREZA → PERGAMINO → ORO → TOSTADO → VENDIDO` (+ `RECHAZADO`) are preserved and sub-stages are recorded as **auto-transitions** (same state) with `EventType` expanded to **11 types** (`COSECHA`, `LIMPIEZA`, `DESPULPADO`, `FERMENTACION`, `LAVADO`, `SECADO`, `REPOSO`, `DESCASCARADO`, `CLASIFICACION`, `TOSTADO`, `VENTA`, `RECHAZADO`). **Additive, not destructive**: old events remain valid.
- **Options considered:** (a) new states per sub-stage — rejected: inflates the machine and breaks compatibility; (b) auto-transitions — chosen; (c) loose fields on the lot — rejected: loses temporal evidence.
- **Consequences:** milestones are not skipped; sub-stages are only recorded within their milestone with no strict order; no going back after `TOSTADO`; the full history lives in `lot_events`.

### ADR-13 — Status of the Day decorative (no contract)

- **Context:** the dashboard wants a motivational "Status of the Day"; it has no traceability value or domain logic.
- **Decision:** it is a **decorative** widget computed on the client from already available data (active lots, last sync, local weather). **It has no endpoint, table, or contract.**
- **Options considered:** (a) dedicated endpoint — rejected: cost without value; (b) client-side calculation — chosen.
- **Consequences:** zero error surface; the backend never stores decorative UI (§12).

### ADR-14 — Photographic evidence (private Storage, id + sha256, outside the canonical hash)

- **Context:** traceability requires visual backup (field photos of the lot) and the binary must not be accessible to users nor mixed into the data hash.
- **Decision:** evidence uploads to a **private** Supabase Storage bucket (`evidencias-lotes`, 5 MB, JPEG/PNG/WebP) via `POST /v1/evidencias` (multipart). The phone never touches Storage: the backend validates MIME + *magic bytes* + size, computes SHA-256, uploads with `service_role` and creates the `public.evidencias` row (`PENDIENTE`). The lot references the photo by `evidencia_id` (not by URL); on attach, the backend copies `evidencia_url`/`evidencia_sha256` **from the row** and marks it `ADJUNTA`. Reads use a temporary signed URL (`GET /v1/lotes/{lote_id}/evidencia`). The evidence **stays outside the canonical per-stage hash**: the hash covers the event's structured data, not binaries.
- **Options considered:** (a) inside the canonical hash — rejected: makes the hash fragile to re-uploads and heavy; (b) public URL — rejected: exposes the photo; (c) private bucket + id/sha256 outside the hash — chosen; (d) no evidence — rejected: doesn't meet the technical memory.
- **Consequences:** the photo is verifiable by its `sha256` (binary integrity) without bloating the chain; access is mediated by the backend and the table has no grants to `anon`/`authenticated`; orphaned `PENDIENTE` objects are purged daily (migration 007 + Edge Function).

---

## 12. Mandatory development best practices

### Backend (FastAPI / Python)
- Modular structure: routers declare their own `prefix`, `tags`, and `dependencies` in `APIRouter` (not in `include_router`).
- **One HTTP operation = one function** (never mix `GET`/`POST` in the same handler).
- `Annotated` + `Depends` for all dependency injection; shared dependencies at the router level.
- **Return types** on path operations (`-> LotRead`): validate, filter, and serialize (avoids exposing internal fields like the wallet or a partial `sha256_hash`).
- **Blocking** I/O endpoints (Supabase SDK) in a synchronous `def` (run in the threadpool), not inside `async` — avoids blocking the event loop.
- **Never** private keys in code: only environment variables (`.env` git-ignored).
- Linter: Ruff. Tests: pytest (in `Backend/tests/`).

### Object-oriented design (domain)
- `Lot` is the **aggregate root**: every modification to it goes through its methods (never modified via direct access).
- `LotEvent` is an **immutable value object** (created once, no setters) — this is what guarantees traceability.
- States are modeled with the **State pattern** (or a `StateMachine` transition map), never giant `if/case` blocks.
- Repositories and gateways are declared as **interfaces** (`LotRepository`, `PaymentGateway`) → the domain doesn't depend on Supabase or Polygon (dependency inversion).
- Application services = behavior layer; routers = presentation only (see §4 OOP and §6).

### Database (PostgreSQL / Supabase)
- ENUM for states, `TIMESTAMPTZ`, CHECK constraints, UUIDs generated on the client (offline-first).
- `lot_events` as **append-only** (no UPDATE/DELETE).
- Indexes for the most common queries (QR code lookup, per-lot history).
- RLS per cooperative; the app never sees another cooperative's rows (Supabase best-practices skill).
- **Read-model / projection**: market and Fair Trade Panel are materialized in the service (read-only) — never written from the mobile (ADR-9).
- **Per-stage hash**: `lot_events.stage_hash` in linear chain; the root lives in `qr_certificate.sha256_hash` and is recalculated on verification (ADR-11).
- **Photographic evidence**: private bucket `evidencias-lotes` + `EVIDENCE` table (metadata); `LOT` stores `evidencia_url` + `evidencia_sha256` copied from the row; outside the canonical hash (ADR-14).

### Backend (FastAPI / Python)
- **Do not persist decorative UI**: the Status of the Day is computed on the client; the backend never stores presentation fields (ADR-13).

### Blockchain (Solidity)
- 0.8.0+, OpenZeppelin, `ReentrancyGuard`, *pull-over-push*, custom errors.
- Static audit with **Slither** before deploying to testnet.
- The signing private key stays outside the repo.

### React Native (Vercel + Callstack skills)
- **Native** navigation (expo-router, native stack/tabs) instead of JS navigators.
- Lists with **FlashList** (virtualization) — never `ScrollView` with `map`.
- Atomic state (**Zustand/Jotai**) with selectors to minimize re-renders.
- Images with **expo-image**; preserve dimensions (avoids layout shift).
- Measure (profilers) before optimizing; don't memoize blindly.

---

## 13. Glossary (so we all speak the same language)

| Term | Meaning |
|---|---|
| **Lot** | A batch of coffee from the same process/producer that's been registered (unit of traceability) |
| **State event** | A recorded transition of the lot (CEREZA → PERGAMINO, etc.) |
| **CEREZA** | Coffee as red cherry fruit at the moment of harvest |
| **PERGAMINO** | Coffee after pulping and drying (parchment) |
| **ORO** | Hulled green coffee, ready to trade |
| **TOSTADO** | Roasted coffee → enables the Coffee Passport QR |
| **VENDIDO** | Sold lot → triggers on-chain payment |
| **Coffee Passport** | Evolution of the Certificate of Origin: public verification with variety, method, altitude, humidity, SCA and per-stage hash timeline (§8) |
| **Public QR** | Scannable code carrying the Coffee Passport and verifying traceability |
| **Smart Contract** | On-chain program that executes the fair payment (3% commission) |
| **Append-only** | A table where you only insert, never edit (evidence) |
| **Offline-first** | The app works without internet and syncs afterward |
| **LWW** | Last-Write-Wins: the most recent change wins sync conflicts |
| **Aggregate root** | The entity (the Lot) that guarantees consistency over its history |
| **Variety** | Coffee cultivar (e.g. Bourbon, Caturra, Gesha, Typica) registered on the lot |
| **Wet processing** | Process with water: pulping + fermentation + washing (produces washed coffee) |
| **Dry processing** | Process without water: the whole fruit is dried and hulled later (natural coffee) |
| **Washed** | Wet method: mucilage is removed with water after fermentation |
| **Natural** | Dry method: the whole fruit is dried with the bean inside (fruity notes) |
| **Honey** | Intermediate method: pulped but mucilage is dried stuck to the bean (semi-washed with honey) |
| **Fermentation** | Sub-stage (PERGAMINO) that develops flavor; method and hours are recorded |
| **Humidity %MC** | Bean moisture content in %; optimal export ~10–12% |
| **SCA score** | Cupping score 0–100 from the *Specialty Coffee Association*; ≥80 = specialty coffee |
| **Resting** | Sub-stage (PERGAMINO) of bean rest (days) before hulling |
| **Tip** | Voluntary buyer-to-producer payment, 100% direct, idempotent and bivalent (ADR-10) |
| **Auto-transition** | Event that doesn't change state (e.g. CEREZA → CEREZA): records sub-stages without moving the milestone |

---

## 14. Proposed development flow (small team)

1. **Domain**: define and document the state machine (milestones + auto-transitions) + rules → §4 (consolidated; Issue 1).
2. **Data model**: ERD + initial migration (includes `TIP` and per-stage columns) → §5 + `db/migrations/` (Issue 2).
3. **API contract**: routes + Pydantic schemas + flow → §6–§8 + `docs/06-contratos.md` (Issue 3).
4. **Mobile UI**: wireframes + navigation tree (4 tabs + public `verify/` group) → `mobile/` (Issue 4).
5. **Offline sync**: full design → §7.5 (Issue 5).
6. **Backend**: set up `Backend/` (FastAPI) starting with the core (state machine + per-stage hash + public Coffee Passport).
7. **Mobile**: `mobile/` with Expo — steps: **My Farm dashboard** (bento + offline alert + FAB) → **3-step wizard** (`lots/new`) → **scanner/passport** (`verify/` + `verify/[code]`) → **fair trade** (`market/[lotId]` with donut 97/3 + tip).
8. **Contracts**: `CoffeePayments.sol` + tests + testnet deploy (per-stage `anchorHash` anchoring).

Each member works on their own feature branch; `docs/ARCHITECTURE.md` (or this English translation) is the single source of truth for the design.

---

*Bean Trust — Technical memory and business model, InnovaTecNM 2026.*
