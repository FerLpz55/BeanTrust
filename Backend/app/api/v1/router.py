"""Router raíz `/v1`: agrega todos los routers de la API."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    compradores,
    cooperativas,
    eventos,
    evidencias,
    fincas,
    lotes,
    mercado,
    pagos,
    sync,
    verificacion,
)

api_router = APIRouter(prefix="/v1")
api_router.include_router(auth.router)
api_router.include_router(cooperativas.router)
api_router.include_router(compradores.router)
api_router.include_router(fincas.router)
api_router.include_router(evidencias.router)
api_router.include_router(lotes.router)
api_router.include_router(eventos.router)
api_router.include_router(verificacion.router)
api_router.include_router(mercado.router)
api_router.include_router(pagos.router)
api_router.include_router(pagos.router_propinas)
api_router.include_router(sync.router)
