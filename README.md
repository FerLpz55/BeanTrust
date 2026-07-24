# BeanTrust
Ecosistema Integral para la trazabilidad y comercio Justo en la cadena de suministro del Café mediante API y BlockChain 

Este proyecto busca mitigar la intermediación excesiva en zonas rurales mediante la asignación de una identidad digital al grano de café. El sistema registra de forma inmutable los eventos clave de la cadena (siembra, cosecha, beneficio y tostado) para certificar el origen del producto y facilitar el acceso a mercados de especialidad.

## Estructura del Proyecto

Este repositorio centraliza los componentes del ecosistema Bean Trust:

* `/api`: Backend (FastAPI). Maneja la lógica de negocio central, la base de datos relacional y la exposición de endpoints.
* `/mobile`: Aplicación móvil (React Native). Interfaz de usuario diseñada para registro de eventos en campo con soporte *offline*.
* `/contracts`: Contratos inteligentes diseñados para la red Polygon.

## Stack Tecnológico

* **Backend:** Python 3.10+ (FastAPI, Pydantic)
* **Base de Datos:** PostgreSQL
* **Frontend:** React Native 
* **Blockchain:** Red Polygon
* **Entorno de Despliegue:** Cloud PaaS (Railway / Contenedores)

## Características del Sistema

* **Trazabilidad por Estados:** Registro de las transiciones físicas del café (Cereza, Pergamino, Oro, Tostado).
* **Operación Offline-First (Móvil):** Arquitectura de almacenamiento local y sincronización diferida para mitigar la falta de conectividad en zonas rurales.
* **Certificación Pública:** Generación de códigos QR vinculados a la historia del lote para validación criptográfica por parte del consumidor final.
