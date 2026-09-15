"""Rate limit: ventana deslizante en memoria y clave HMAC por IP+ruta (A07)."""

from __future__ import annotations

import string

import pytest

from app.core.config import Settings
from app.dependencies import clave_rate_limit
from app.repositories.rate_limit import InMemoryRateLimitRepo
from tests.unit.test_config import RequestFalso

BASE = {
    "_env_file": None,
    "jwt_secret": "x" * 40,
    "rate_limit_hmac_secret": "secreto-hmac",
}


def _settings(**extra: object) -> Settings:
    return Settings(**BASE, **extra)


def test_permite_exactamente_el_limite_y_bloquea_la_siguiente() -> None:
    repo = InMemoryRateLimitRepo()
    assert [repo.consumir("ip", 3, 60) for _ in range(3)] == [True, True, True]
    assert repo.consumir("ip", 3, 60) is False


def test_claves_independientes() -> None:
    repo = InMemoryRateLimitRepo()
    assert repo.consumir("a", 1, 60) is True
    assert repo.consumir("b", 1, 60) is True
    assert repo.consumir("a", 1, 60) is False


def test_ventana_cero_permite_siempre(monkeypatch: pytest.MonkeyPatch) -> None:
    """Con ventana 0 s el hit anterior queda fuera del cubo en cada llamada."""
    tiempos = iter([1.0, 2.0, 3.0])
    monkeypatch.setattr("app.repositories.rate_limit.time.monotonic", lambda: next(tiempos))
    repo = InMemoryRateLimitRepo()
    assert repo.consumir("k", 1, 0) is True
    assert repo.consumir("k", 1, 0) is True
    assert repo.consumir("k", 1, 0) is True


def test_ventana_expira_y_vuelve_a_permitir(monkeypatch: pytest.MonkeyPatch) -> None:
    ahora = {"t": 1000.0}
    monkeypatch.setattr("app.repositories.rate_limit.time.monotonic", lambda: ahora["t"])
    repo = InMemoryRateLimitRepo()
    assert repo.consumir("k", 1, 10) is True
    assert repo.consumir("k", 1, 10) is False
    ahora["t"] += 11
    assert repo.consumir("k", 1, 10) is True


def test_clave_es_determinista() -> None:
    settings = _settings()
    req = RequestFalso({"x-forwarded-for": "203.0.113.7"}, "10.0.0.1", path="/v1/auth/login")
    assert clave_rate_limit(req, settings) == clave_rate_limit(req, settings)


def test_clave_cambia_con_ip_y_con_ruta() -> None:
    settings = _settings()
    base = RequestFalso({}, "10.0.0.1", path="/v1/auth/login")
    otra_ip = RequestFalso({}, "10.0.0.2", path="/v1/auth/login")
    otra_ruta = RequestFalso({}, "10.0.0.1", path="/v1/auth/recover")
    assert clave_rate_limit(base, settings) != clave_rate_limit(otra_ip, settings)
    assert clave_rate_limit(base, settings) != clave_rate_limit(otra_ruta, settings)


def test_clave_no_contiene_la_ip_y_es_hmac_hex() -> None:
    settings = _settings()
    req = RequestFalso({"x-forwarded-for": "203.0.113.7"}, "10.0.0.1", path="/v1/auth/login")
    clave = clave_rate_limit(req, settings)
    assert len(clave) == 64
    assert set(clave) <= set(string.hexdigits)
    assert "203.0.113.7" not in clave
    assert "10.0.0.1" not in clave
