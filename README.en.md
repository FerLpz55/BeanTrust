# BeanTrust

*This is the English translation of [`README.md`](./README.md). If the two ever diverge, treat the Spanish version as the source of truth.*

An integrated ecosystem for traceability and fair trade in the coffee supply chain, powered by an API and blockchain.

This project aims to reduce excessive intermediation in rural areas by giving each coffee bean a digital identity. The system immutably records key events in the chain (harvest, cleaning, pulping, fermentation, washing, drying, resting, hulling, grading, roasting, and sale) to certify the product's origin, improve access to specialty markets, and enable direct buyer-to-producer tips.

## Project Structure

This repository centralizes the components of the Bean Trust ecosystem:

* `/Backend`: Backend (FastAPI). Handles core business logic, the relational database (Supabase/PostgreSQL, migrations in `Backend/db/`), and exposes endpoints.
* `/mobile`: Mobile app (React Native / Expo). UI designed for field event registration with *offline* support.
* `/docs`: Technical documentation (the architecture is the source of truth for the design).
* `.opencode/`: Agent configuration; `AGENTS.md` holds the project's persistent memory and docs↔code alignment rules.

> **Note:** `contracts/` (Foundry, Solidity) contains `CoffeeTraceability.sol`,
> deployed and active on Base Sepolia (Coffee Passport anchoring, ADR-11);
> payments and tips remain simulated (`FakeGatewayPagos`). There is no root `db/`:
> the DB lives in `Backend/db/`. The real structure is described in
> `docs/ARCHITECTURE.en.md` §3.

## Documentation

* [Architecture](docs/ARCHITECTURE.en.md) — what each piece does, why it's designed that way, and how it all fits together. ([Spanish original](docs/ARCHITECTURE.md))

## Tech Stack

* **Backend:** Python ≥3.12 (FastAPI, Pydantic)
* **Database:** Supabase / PostgreSQL
* **Frontend:** React Native / Expo Router
* **Blockchain:** Base Sepolia (real on-chain Coffee Passport anchoring with `CoffeeTraceability`); payments/tips are **simulated** by a fake gateway
* **Deployment environment:** Vercel (API) + Supabase (DB/Auth)

## System Features

* **State-based traceability:** Tracks the physical transitions of the coffee (CEREZA → PERGAMINO → ORO → TOSTADO → VENDIDO) with sub-stages (cleaning, fermentation, washing, drying, resting, grading).
* **Offline-first operation (mobile):** Local storage and deferred sync architecture to work around poor connectivity in rural areas.
* **Coffee Passport:** Generates QR codes linked to a lot's history for cryptographic verification by the end consumer, with enriched data (variety, method, humidity, SCA score).
* **Fair trade:** 97/3 panel (97% to the producer, 3% operation) + direct buyer-to-producer tips.

## MVP Status (honest)

- The backend runs on Supabase/PostgreSQL in production (closed Android pilot);
  **public sign-up is disabled** and pilot accounts are created via Auth Admin.
- The mobile app covers login/recovery, farms, lot creation, event registration
  (F11), traceability, a verifiable Coffee Passport with QR, and the fair-trade panel.
- **Offline-first field mode:** local SQLite cache, FIFO sync queue with
  retry/discard, and sync on reconnect (`src/offline/`).
- **Photographic evidence (ADR-14):** camera/gallery → normalized JPEG + SHA-256,
  uploaded to the **private** `evidencias-lotes` bucket via `POST /v1/evidencias`
  and queued offline alongside the harvest; reads use a temporary signed URL.
- **Performance:** long lists virtualized with FlashList.
- **Security (B11 advances):** per-user effective RLS (JWT per request), shared
  rate limit in Postgres, and rotating refresh in the local provider.
- **Blockchain (ADR-11):** real Coffee Passport anchoring on Base Sepolia
  (`CoffeeTraceability`, production running `BEAN_WEB3_MODE=anchor` with 9
  `CONFIRMADA` anchors); **payments and tips remain simulated** with a fake
  gateway and no real money moves.
- **Pending:** BaseScan contract verification and the producer's `public_address`
  wallet (on-chain payments, later phase).
- Operational flow verification: `Backend/scripts/smoke_production.py`.
