"""Punto de entrada de la aplicación FastAPI.

Crea la app con `crear_app()` (testeable e independiente del entorno). Los
errores de dominio se traducen a respuestas JSON limpias; los de infraestructura
quedan registrados y devuelven 500 sin filtrar detalles internos.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logger import setup_logging
from app.models.dominio import ErrorDeDominio

logger = logging.getLogger(__name__)


def crear_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "API de trazabilidad y comercio justo del café: gestión de lotes, "
            "certificados QR, sincronización offline y pagos con división de "
            "comisión (FastAPI + Supabase)."
        ),
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ErrorDeDominio)
    async def handler_dominio(_request: Request, exc: ErrorDeDominio) -> JSONResponse:
        if exc.status_code >= 500:
            logger.error("Error interno no controlado: %s", exc.mensaje, exc_info=True)
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.mensaje})

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(api_router)
    return app


app = crear_app()
