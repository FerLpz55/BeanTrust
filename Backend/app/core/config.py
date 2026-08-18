"""Configuración central del backend (pydantic-settings, prefijo `BEAN_`).

Nunca se lee `os.environ` a mano: aquí se validan tipos y se fuerza el
arranque temprano cuando falta un valor obligatorio.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BEAN_", env_file=".env", extra="ignore")

    environment: Literal["development", "production"] = "development"
    app_name: str = "BeanTrust API"
    app_version: str = "0.1.0"

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:8081"])

    repo_backend: Literal["memory", "supabase"] = "memory"
    auth_backend: Literal["local", "supabase"] = "local"

    jwt_secret: str = "desarrollo-no-usar-en-produccion"
    access_token_ttl: int = 3600
    refresh_token_ttl: int = 2592000
    token_issuer: str = "beantrust-api"
    token_audience: str = "beantrust-api"
    login_rate_limit: int = 20

    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_anon_key: str = ""

    log_level: str = "INFO"
    docs_enabled: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parsear_origins(cls, valor: object) -> object:
        if isinstance(valor, str):
            return [parte.strip() for parte in valor.split(",") if parte.strip()]
        return valor

    @field_validator("jwt_secret")
    @classmethod
    def _validar_jwt_secret(cls, valor: str) -> str:
        if len(valor.encode("utf-8")) < 32:
            raise ValueError("BEAN_JWT_SECRET debe tener al menos 32 bytes.")
        return valor

    @field_validator("environment", mode="after")
    @classmethod
    def _proteger_produccion(cls, entorno: str, info) -> str:
        valores = info.data
        if entorno == "production":
            if valores.get("auth_backend") != "supabase":
                raise ValueError(
                    "En producción el auth debe usar Supabase (BEAN_AUTH_BACKEND=supabase)."
                )
            if valores.get("repo_backend") != "supabase":
                raise ValueError(
                    "En producción la BD debe usar Supabase (BEAN_REPO_BACKEND=supabase)."
                )
            if not valores.get("supabase_url") or not valores.get("supabase_service_key"):
                raise ValueError(
                    "En producción se requieren BEAN_SUPABASE_URL y BEAN_SUPABASE_SERVICE_KEY."
                )
        return entorno


@lru_cache
def get_settings() -> Settings:
    return Settings()
