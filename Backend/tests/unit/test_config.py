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
        supabase_anon_key="anon",
        rate_limit_hmac_secret="secreto-hmac",
    )
    assert settings.environment == "production"


@pytest.mark.parametrize(
    ("campos", "mensaje"),
    [
        ({"auth_backend": "local"}, "auth debe usar Supabase"),
        ({"repo_backend": "memory"}, "BD debe usar Supabase"),
        ({"supabase_service_key": ""}, "se requieren BEAN_SUPABASE_URL"),
        ({"supabase_anon_key": ""}, "se requiere BEAN_SUPABASE_ANON_KEY"),
        ({"rate_limit_hmac_secret": ""}, "se requiere BEAN_RATE_LIMIT_HMAC_SECRET"),
    ],
)
def test_produccion_insegura_se_rechaza(campos: dict[str, str], mensaje: str) -> None:
    valores = {
        "environment": "production",
        "repo_backend": "supabase",
        "auth_backend": "supabase",
        "supabase_url": "https://x.supabase.co",
        "supabase_service_key": "clave",
        "supabase_anon_key": "anon",
        "rate_limit_hmac_secret": "secreto-hmac",
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


class RequestFalso:
    """Lo mínimo que `ip_del_cliente` mira de una Request."""

    def __init__(self, headers: dict[str, str], client_host: str | None) -> None:
        self.headers = headers
        self.client = type("C", (), {"host": client_host})() if client_host else None


def test_ip_prefiere_la_cabecera_de_la_plataforma() -> None:
    from app.dependencies import ip_del_cliente

    req = RequestFalso(
        {"x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "1.2.3.4"},
        "10.0.0.1",
    )
    assert ip_del_cliente(req) == "203.0.113.7"


def test_ip_toma_la_primera_entrada_de_forwarded_for() -> None:
    """Detrás del proxy, `client.host` es el proxy y todos compartirían cubo."""
    from app.dependencies import ip_del_cliente

    req = RequestFalso({"x-forwarded-for": "203.0.113.7, 70.41.3.18"}, "10.0.0.1")
    assert ip_del_cliente(req) == "203.0.113.7"


def test_ip_cae_al_cliente_directo_sin_proxy() -> None:
    from app.dependencies import ip_del_cliente

    assert ip_del_cliente(RequestFalso({}, "10.0.0.1")) == "10.0.0.1"
    assert ip_del_cliente(RequestFalso({}, None)) == "desconocido"


def test_refresh_admite_el_token_corto_de_supabase() -> None:
    """Los refresh tokens de Supabase son opacos y cortos (~12 chars); el
    `min_length=20` heredado del proveedor local impedía renovar la sesión."""
    from app.schemas.auth import RefreshRequest

    assert RefreshRequest(refresh_token="uoh6wvqbwflz").refresh_token == "uoh6wvqbwflz"
