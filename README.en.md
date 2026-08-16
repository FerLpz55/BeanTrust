# BeanTrust

*This is the English translation of [`README.md`](./README.md). If the two ever diverge, treat the Spanish version as the source of truth.*

An integrated ecosystem for traceability and fair trade in the coffee supply chain, powered by an API and blockchain.

This project aims to reduce excessive intermediation in rural areas by giving each coffee bean a digital identity. The system immutably records key events in the chain (planting, harvest, processing, and roasting) to certify the product's origin and improve access to specialty markets.

## Project Structure

This repository centralizes the components of the Bean Trust ecosystem:

* `/backend`: Backend (FastAPI). Handles core business logic, the relational database (Supabase/PostgreSQL), and exposes endpoints.
* `/mobile`: Mobile app (React Native / Expo). UI designed for field event registration with *offline* support.
* `/contracts`: Smart contracts (Solidity) built for the Polygon network.
* `/db`: SQL migrations + seed data.
* `/docs`: Technical documentation.

## Documentation

* [Architecture](docs/ARCHITECTURE.en.md) — what each piece does, why it's designed that way, and how it all fits together. ([Spanish original](docs/ARCHITECTURE.md))

## Tech Stack

* **Backend:** Python 3.10+ (FastAPI, Pydantic)
* **Database:** PostgreSQL
* **Frontend:** React Native
* **Blockchain:** Polygon network
* **Deployment environment:** Cloud PaaS (Railway / Containers)

## System Features

* **State-based traceability:** Tracks the physical transitions of the coffee (Cherry, Parchment, Green, Roasted).
* **Offline-first operation (mobile):** Local storage and deferred sync architecture to work around poor connectivity in rural areas.
* **Public certification:** Generates QR codes linked to a lot's history for cryptographic verification by the end consumer.
