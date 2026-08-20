# BeanTrust

*English translation: [`README.en.md`](./README.en.md).*

Ecosistema Integral para la trazabilidad y comercio justo en la cadena de suministro del café mediante API y blockchain.

Este proyecto busca mitigar la intermediación excesiva en zonas rurales mediante la asignación de una identidad digital al grano de café. El sistema registra de forma inmutable los eventos clave de la cadena (cosecha, limpieza, despulpado, fermentación, lavado, secado, reposo, descascarado, clasificación, tostado y venta) para certificar el origen del producto, facilitar el acceso a mercados de especialidad y permitir propinas directas del comprador al productor.

## Estructura del Proyecto

Este repositorio centraliza los componentes del ecosistema Bean Trust:

* `/backend`: Backend (FastAPI). Maneja la lógica de negocio central, la base de datos relacional (Supabase/PostgreSQL) y la exposición de endpoints.
* `/mobile`: Aplicación móvil (React Native / Expo). Interfaz de usuario diseñada para registro de eventos en campo con soporte *offline*.
* `/contracts`: Contratos inteligentes (Solidity) diseñados para la red Polygon.
* `/db`: Migraciones SQL + seed.
* `/docs`: Documentación técnica.

## Documentación

* [Arquitectura](docs/ARCHITECTURE.md) — qué hace cada pieza, por qué está diseñada así y cómo se relaciona entre sí.

## Stack Tecnológico

* **Backend:** Python 3.10+ (FastAPI, Pydantic)
* **Base de Datos:** PostgreSQL
* **Frontend:** React Native 
* **Blockchain:** Red Polygon
* **Entorno de Despliegue:** Cloud PaaS (Railway / Contenedores)

## Características del Sistema

* **Trazabilidad por Estados:** Registro de las transiciones físicas del café (CEREZA → PERGAMINO → ORO → TOSTADO → VENDIDO) con sub-etapas (limpieza, fermentación, lavado, secado, reposo, clasificación).
* **Operación Offline-First (Móvil):** Arquitectura de almacenamiento local y sincronización diferida para mitigar la falta de conectividad en zonas rurales.
* **Pasaporte de Café:** Generación de códigos QR vinculados a la historia del lote para validación criptográfica por parte del consumidor final, con datos enriquecidos (variedad, método, humedad, puntaje SCA).
* **Comercio Justo:** Panel 97/3 (97% al productor, 3% operación) + propinas directas del comprador al productor.
