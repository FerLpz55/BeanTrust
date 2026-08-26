"""Configuración: el modo producción y el parseo de orígenes CORS."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings

BASE = {
    "_env_file": None,
    "jwt_secret": "x" * 40,
}


def test_produccion_con_supabase_arranca() -> None:
    """Regresión: el validador leía `info.data` de un campo que se valida el
    primero, así que `production` fallaba siempre, incluso bien configurado."""
    settings = Settings(
        **BASE,
        environment="production",
        repo_backend="supabase",
        auth_backend="supabase",
        supabase_url="https://x.supabase.co",
        supabase_service_key="clave",
    )
    assert settings.environment == "production"


@pytest.mark.parametrize(
    ("campos", "mensaje"),
    [
        ({"auth_backend": "local"}, "auth debe usar Supabase"),
        ({"repo_backend": "memory"}, "BD debe usar Supabase"),
        ({"supabase_service_key": ""}, "se requieren BEAN_SUPABASE_URL"),
    ],
)
def test_produccion_insegura_se_rechaza(campos: dict[str, str], mensaje: str) -> None:
    valores = {
        "environment": "production",
        "repo_backend": "supabase",
        "auth_backend": "supabase",
        "supabase_url": "https://x.supabase.co",
        "supabase_service_key": "clave",
        **campos,
    }
    with pytest.raises(ValidationError, match=mensaje):
        Settings(**BASE, **valores)


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [
        ("http://a.com, http://b.com", ["http://a.com", "http://b.com"]),
        ("*", ["*"]),
        ('["http://c.com"]', ["http://c.com"]),
    ],
)
def test_cors_admite_coma_y_json(valor: str, esperado: list[str]) -> None:
    """Sin `NoDecode`, pydantic-settings intenta `json.loads` del valor y el
    formato coma-separado que documenta .env.example revienta el arranque."""
    assert Settings(**BASE, cors_origins=valor).cors_origins == esperado
