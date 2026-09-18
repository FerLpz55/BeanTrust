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


PROD_SUPABASE = {
    "environment": "production",
    "repo_backend": "supabase",
    "auth_backend": "supabase",
    "supabase_url": "https://x.supabase.co",
    "supabase_service_key": "clave",
    "supabase_anon_key": "anon",
    "rate_limit_hmac_secret": "secreto-hmac",
}

WEB3_COMPLETO = {
    "web3_mode": "anchor",
    "web3_rpc_url": "https://sepolia.base.org",
    "web3_contract_address": "0x" + "ab" * 20,
    "web3_contract_code_hash": "0x" + "cd" * 32,
    "web3_pauser_address": "0x" + "ef" * 20,
    "web3_anchor_address": "0x" + "22" * 20,
    "web3_backend_private_key": "0x" + "11" * 32,
    "web3_cron_secret": "s" * 40,
}


def test_produccion_anchor_completo_arranca() -> None:
    settings = Settings(**BASE, **PROD_SUPABASE, **WEB3_COMPLETO)
    assert settings.web3_mode == "anchor"
    assert settings.web3_chain_id == 84532


@pytest.mark.parametrize(
    ("faltante", "mensaje"),
    [
        ("web3_rpc_url", "BEAN_WEB3_RPC_URL"),
        ("web3_contract_address", "BEAN_WEB3_CONTRACT_ADDRESS"),
        ("web3_contract_code_hash", "BEAN_WEB3_CONTRACT_CODE_HASH"),
        ("web3_pauser_address", "BEAN_WEB3_PAUSER_ADDRESS"),
        ("web3_anchor_address", "BEAN_WEB3_ANCHOR_ADDRESS"),
        ("web3_backend_private_key", "BEAN_WEB3_BACKEND_PRIVATE_KEY"),
        ("web3_cron_secret", "BEAN_WEB3_CRON_SECRET"),
    ],
)
def test_produccion_anchor_incompleto_se_rechaza(faltante: str, mensaje: str) -> None:
    valores = {**WEB3_COMPLETO, faltante: ""}
    with pytest.raises(ValidationError, match=mensaje):
        Settings(**BASE, **PROD_SUPABASE, **valores)


@pytest.mark.parametrize(
    ("campo", "valor"),
    [
        ("web3_rpc_url", "ftp://x"),
        ("web3_contract_address", "0x1234"),
        ("web3_contract_code_hash", "0x" + "cd" * 20),
        ("web3_pauser_address", "0x1234"),
        ("web3_anchor_address", "0x1234"),
        ("web3_backend_private_key", "0x" + "11" * 10),
        ("web3_cron_secret", "corto"),
    ],
)
def test_web3_formato_invalido_se_rechaza(campo: str, valor: str) -> None:
    with pytest.raises(ValidationError):
        Settings(**BASE, **{**WEB3_COMPLETO, campo: valor})


def test_cron_secret_acepta_alias_sin_prefijo(monkeypatch) -> None:
    """Vercel inyecta `CRON_SECRET`; el backend lo acepta como alias."""
    monkeypatch.setenv("CRON_SECRET", "z" * 40)
    monkeypatch.delenv("BEAN_WEB3_CRON_SECRET", raising=False)
    assert Settings(**BASE).web3_cron_secret == "z" * 40


def test_confirmaciones_fuera_de_rango_se_rechaza() -> None:
    with pytest.raises(ValidationError):
        Settings(**BASE, **{**WEB3_COMPLETO, "web3_confirmations": 0})
    with pytest.raises(ValidationError):
        Settings(**BASE, **{**WEB3_COMPLETO, "web3_confirmations": 13})


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
    """Lo mínimo que `ip_del_cliente` y `clave_rate_limit` miran de una Request."""

    def __init__(
        self,
        headers: dict[str, str],
        client_host: str | None,
        path: str = "/v1/auth/login",
    ) -> None:
        self.headers = headers
        self.client = type("C", (), {"host": client_host})() if client_host else None
        self.url = type("U", (), {"path": path})()


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
