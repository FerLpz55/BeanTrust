"""Alta pública de productores (§10): sin escalada de privilegios.

El registro público solo crea `productor`. Un rol privilegiado en el cuerpo se
rechaza (422) y, aun si se colara, el proveedor fuerza `productor` (el trigger
de Auth lo impone para altas directas contra Supabase).
"""

from __future__ import annotations

import pytest


def test_registro_crea_productor(client):
    r = client.post(
        "/v1/auth/register",
        json={
            "email": "nuevo@beantrust.dev",
            "password": "Nuevo1234!",
            "nombre": "Nuevo Productor",
        },
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    me = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    assert me.json()["rol"] == "productor"


def test_registro_acepta_rol_productor_explicito(client):
    r = client.post(
        "/v1/auth/register",
        json={
            "email": "explicito@beantrust.dev",
            "password": "Prod1234!",
            "nombre": "Productor Explícito",
            "rol": "productor",
        },
    )
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("rol", ["admin", "cooperativa", "comprador"])
def test_registro_rechaza_rol_privilegiado(client, rol: str):
    email = f"intruso-{rol}@beantrust.dev"
    r = client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "Priv1234!",
            "nombre": "Intruso",
            "rol": rol,
        },
    )
    assert r.status_code == 422, r.text
    # No se creó la cuenta ni una sesión.
    login = client.post("/v1/auth/login", json={"email": email, "password": "Priv1234!"})
    assert login.status_code == 401, login.text


def test_cuenta_nueva_empieza_vacia(client):
    """Un productor recién creado no hereda fincas, lotes ni saldo."""
    r = client.post(
        "/v1/auth/register",
        json={
            "email": "vacio@beantrust.dev",
            "password": "Vacio1234!",
            "nombre": "Productor Vacío",
        },
    )
    assert r.status_code == 200, r.text
    header = {"Authorization": f"Bearer {r.json()['access_token']}"}

    assert client.get("/v1/fincas", headers=header).json() == []
    assert client.get("/v1/lotes", headers=header).json()["items"] == []
    saldo = client.get("/v1/pagos/saldo", headers=header).json()
    assert saldo["saldo_total"] == 0
    assert saldo["total_pagos"] == 0
    assert saldo["total_propinas"] == 0
