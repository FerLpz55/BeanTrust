"""Configuración central del backend (pydantic-settings, prefijo `BEAN_`).

Nunca se lee `os.environ` a mano: aquí se validan tipos y se fuerza el
arranque temprano cuando falta un valor obligatorio.
"""

from __future__ import annotations

import json
from contextlib import suppress
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BEAN_", env_file=".env", extra="ignore")

    environment: Literal["development", "production"] = "development"
    app_name: str = "BeanTrust API"
    app_version: str = "0.1.0"

    # `NoDecode` apaga el intento de `json.loads` que pydantic-settings hace con
    # los tipos complejos: sin él, un `BEAN_CORS_ORIGINS=a,b` (el formato que
    # documenta .env.example) revienta el arranque con SettingsError antes de
    # que corra el validador de abajo.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:8081"]
    )

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

    # Evidencia fotográfica (bucket privado). El backend es el único que sube,
    # firma lectura y elimina objetos; el móvil nunca habla con Storage.
    evidence_bucket: str = "evidencias-lotes"
    evidence_max_bytes: int = 5 * 1024 * 1024
    evidence_ttl_hours: int = 24

    # Rate limit compartido: el hash de la clave (ip|endpoint) se firma con este
    # secreto para no guardar la IP en claro en Postgres.
    rate_limit_hmac_secret: str = ""
    rate_limit_window_seconds: int = 60

    log_level: str = "INFO"
    docs_enabled: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parsear_origins(cls, valor: object) -> object:
        if isinstance(valor, str):
            texto = valor.strip()
            # Con `NoDecode` ya no se decodifica solo: aceptamos también la
            # forma JSON para que un `["a","b"]` no acabe siendo un origen literal.
            if texto.startswith("["):
                with suppress(json.JSONDecodeError):
                    return json.loads(texto)
            return [parte.strip() for parte in texto.split(",") if parte.strip()]
        return valor

    @field_validator("jwt_secret")
    @classmethod
    def _validar_jwt_secret(cls, valor: str) -> str:
        if len(valor.encode("utf-8")) < 32:
            raise ValueError("BEAN_JWT_SECRET debe tener al menos 32 bytes.")
        return valor

    # Va sobre el modelo completo, no sobre `environment`: al ser el primer
    # campo declarado, un `field_validator` lo vería con `info.data` vacío y
    # rechazaría *siempre* `production`.
    @model_validator(mode="after")
    def _proteger_produccion(self) -> Settings:
        if self.environment == "production":
            if self.auth_backend != "supabase":
                raise ValueError(
                    "En producción el auth debe usar Supabase (BEAN_AUTH_BACKEND=supabase)."
                )
            if self.repo_backend != "supabase":
                raise ValueError(
                    "En producción la BD debe usar Supabase (BEAN_REPO_BACKEND=supabase)."
                )
            if not self.supabase_url or not self.supabase_service_key:
                raise ValueError(
                    "En producción se requieren BEAN_SUPABASE_URL y BEAN_SUPABASE_SERVICE_KEY."
                )
            if not self.supabase_anon_key:
                raise ValueError("En producción se requiere BEAN_SUPABASE_ANON_KEY.")
            if not self.rate_limit_hmac_secret:
                raise ValueError("En producción se requiere BEAN_RATE_LIMIT_HMAC_SECRET.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
