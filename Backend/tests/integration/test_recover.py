"""B14 · Recuperación de contraseña (`POST /v1/auth/recover` + `/confirm`).

El token es de **un solo uso** sin almacén de jti: lleva una huella del hash de
contraseña vigente, así que al cambiarla el token deja de validar.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration

NUEVA = "NuevaClave123!"


def _solicitar(client, email: str) -> dict:
    r = client.post("/v1/auth/recover", json={"email": email})
    assert r.status_code == 200, r.text
    return r.json()


def test_flujo_completo_cambia_la_contrasena(client):
    cuerpo = _solicitar(client, "productor@beantrust.dev")
    assert cuerpo["token_dev"], "en desarrollo se expone el token (no hay correo)"

    r = client.post(
        "/v1/auth/recover/confirm",
        json={"token": cuerpo["token_dev"], "password": NUEVA},
    )
    assert r.status_code == 200, r.text

    # la nueva sirve y la vieja ya no
    assert client.post(
        "/v1/auth/login", json={"email": "productor@beantrust.dev", "password": NUEVA}
    ).status_code == 200
    assert client.post(
        "/v1/auth/login", json={"email": "productor@beantrust.dev", "password": "Prod123!"}
    ).status_code == 401


def test_token_es_de_un_solo_uso(client):
    token = _solicitar(client, "productor@beantrust.dev")["token_dev"]
    primero = client.post("/v1/auth/recover/confirm", json={"token": token, "password": NUEVA})
    assert primero.status_code == 200, primero.text

    segundo = client.post(
        "/v1/auth/recover/confirm", json={"token": token, "password": "OtraMas123!"}
    )
    assert segundo.status_code == 401, "el token no puede reutilizarse"


def test_email_inexistente_responde_igual(client):
    """No debe permitir enumerar cuentas: misma forma de respuesta."""
    conocido = _solicitar(client, "productor@beantrust.dev")
    desconocido = _solicitar(client, "nadie@beantrust.dev")
    assert desconocido["mensaje"] == conocido["mensaje"]
    assert desconocido["token_dev"] is None


def test_token_invalido_rechaza(client):
    r = client.post(
        "/v1/auth/recover/confirm",
        json={"token": "no-es-un-jwt-pero-es-largo-de-sobra-xxxxx", "password": NUEVA},
    )
    assert r.status_code == 401


def test_password_corta_es_422(client):
    token = _solicitar(client, "productor@beantrust.dev")["token_dev"]
    r = client.post("/v1/auth/recover/confirm", json={"token": token, "password": "corta"})
    assert r.status_code == 422
